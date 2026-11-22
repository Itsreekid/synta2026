// Offline batch compression only: no database, R2 credentials or live platform access.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, stat, realpath, unlink, link, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, extname, basename, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const formats = new Set(['.mp4', '.mov', '.webm', '.mkv']);
const presets = new Set(['fast', 'medium', 'slow']);

export function mediaTool(name) {
    const portable = join(root, '.local-tools', 'ffmpeg', 'bin', name + (process.platform === 'win32' ? '.exe' : ''));
    return process.env[name.toUpperCase() + '_PATH'] || (existsSync(portable) ? portable : name);
}

export function runMediaTool(executable, args, { timeout = 6 * 60 * 60 * 1000, onProgress } = {}) {
    return new Promise((resolveRun, reject) => {
        const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '', errors = '', timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
        child.stdout.on('data', data => { output = (output + data).slice(-2 * 1024 * 1024); onProgress?.(data.toString()); });
        child.stderr.on('data', data => { errors = (errors + data).slice(-4000); });
        child.on('error', error => { clearTimeout(timer); reject(new Error(error.code === 'ENOENT' ? 'FFmpeg/FFprobe introuvable. Consultez REPLAY_COMPRESSION.md.' : error.message)); });
        child.on('close', code => { clearTimeout(timer); if(timedOut)return reject(new Error('Traitement trop long : fichier original conservé.'));code === 0 ? resolveRun(output) : reject(new Error(`Erreur vidéo (${code}) : ${errors.slice(-1000)}`)); });
    });
}

export async function probeMedia(path, ffprobe = mediaTool('ffprobe')) {
    const result = JSON.parse(await runMediaTool(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_format', '-show_streams', '-of', 'json', resolve(path)], { timeout: 30000 }));
    const video = result.streams?.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
    const duration = Number(result.format?.duration);
    if (!video || !Number.isFinite(duration) || duration <= 0) throw new Error('Vidéo ou durée invalide.');
    return { duration, width: video.width, height: video.height, codec: video.codec_name,
        audioTracks: result.streams.filter(stream => stream.codec_type === 'audio').length,
        rotation: Number(video.side_data_list?.find(data => data.rotation != null)?.rotation || video.tags?.rotate || 0) };
}

export function validateOutput(before, after) {
    if (Math.abs(before.duration - after.duration) > Math.max(.5, before.duration * .0001)) throw new Error('La durée a changé : résultat refusé.');
    const rotated = Math.abs(before.rotation) % 180 === 90;
    if (after.codec !== 'h264' || after.width !== (rotated ? before.height : before.width) ||
        after.height !== (rotated ? before.width : before.height) || after.audioTracks !== before.audioTracks) {
        throw new Error('Résolution, codec ou pistes audio non conformes : résultat refusé.');
    }
}

export function compressionArgs(input, output, { crf = 23, preset = 'medium', threads = 2 } = {}) {
    if (!Number.isInteger(crf) || crf < 18 || crf > 28 || !presets.has(preset) || !Number.isInteger(threads) || threads < 1 || threads > 8) {
        throw new Error('Réglages invalides : CRF 18–28, preset fast/medium/slow, threads 1–8.');
    }
    return ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-protocol_whitelist', 'file,pipe',
        '-threads', String(threads), '-i', resolve(input), '-map', '0:V:0', '-map', '0:a?',
        '-map_metadata', '0', '-map_chapters', '0', '-c:v', 'libx264', '-preset', preset, '-crf', String(crf),
        '-pix_fmt', 'yuv420p', '-threads', String(threads), '-c:a', 'aac', '-b:a', '96k',
        '-movflags', '+faststart', '-fps_mode', 'passthrough', '-progress', 'pipe:1', resolve(output)];
}

async function checksum(path) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
}

const inside = (parent, child) => { const rel = relative(parent, child); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };

export async function optimizeReplays(input, { output, crf = 23, preset = 'medium', threads = 2, recursive = false, log = console.log } = {}) {
    const source = await realpath(resolve(input));
    const info = await stat(source);
    const base = info.isDirectory() ? source : dirname(source);
    // Require a separate output folder; never overwrite or encode an original in place.
    const destination = resolve(output || join(base, 'replay-output'));
    await mkdir(destination, { recursive: true });
    const realDestination = await realpath(destination);
    if (inside(realDestination, source)) throw new Error('Choisissez un dossier de sortie distinct du dossier source.');
    compressionArgs(source, join(destination, 'check.mp4'), { crf, preset, threads });
    await runMediaTool(mediaTool('ffmpeg'), ['-version'], { timeout: 10000 });
    await runMediaTool(mediaTool('ffprobe'), ['-version'], { timeout: 10000 });
    const files = [];
    async function collect(folder) {
        for (const item of await readdir(folder, { withFileTypes: true })) {
            const path = join(folder, item.name);
            if (item.isSymbolicLink() || inside(realDestination, path)) continue;
            if (item.isDirectory() && recursive) await collect(path);
            else if (item.isFile() && formats.has(extname(path).toLowerCase())) files.push(path);
        }
    }
    if (info.isDirectory()) await collect(source);
    else if (info.isFile() && formats.has(extname(source).toLowerCase())) files.push(source);
    else throw new Error('Choisissez une vidéo MP4, MOV, WebM, MKV ou un dossier.');
    files.sort();
    if (!files.length) throw new Error('Aucune vidéo trouvée dans ce dossier.');
    const report = { createdAt: new Date().toISOString(), settings: { crf, preset, threads }, files: [] };
    // Sequential native processes keep RAM/CPU bounded; no buffering entire videos.
    for (const file of files) {
        const target = join(realDestination, relative(base, dirname(file)), basename(file) + '.optimized.mp4');
        const entry = { source: file, output: target };
        let temporary;
        try {
            await mkdir(dirname(target), { recursive: true });
            if (existsSync(target)) { entry.status = 'exists'; entry.message = 'Sortie déjà présente, aucun écrasement.'; report.files.push(entry); continue; }
            const original = await stat(file);
            entry.originalBytes = original.size;
            entry.sourceSha256 = await checksum(file);
            const before = await probeMedia(file);
            temporary = join(dirname(target), '.' + randomUUID() + '.partial.mp4');
            log(`Compression : ${basename(file)} (${Math.round(original.size / 1048576)} Mo)…`);
            let lastProgress = 0;
            await runMediaTool(mediaTool('ffmpeg'), compressionArgs(file, temporary, { crf, preset, threads }), {
                onProgress: chunk => {
                    const match = /out_time_us=(\d+)/.exec(chunk);
                    const progress = match ? Math.min(100, Math.floor(Number(match[1]) / (before.duration * 10000))) : 0;
                    if (progress >= lastProgress + 10) { lastProgress = progress; log(`  ${progress} %`); }
                },
            });
            const after = await probeMedia(temporary);
            validateOutput(before, after);
            // Decode the entire candidate: metadata checks alone cannot prove it is playable.
            await runMediaTool(mediaTool('ffmpeg'), ['-v', 'error', '-xerror', '-nostdin', '-protocol_whitelist', 'file,pipe', '-threads', String(threads), '-i', temporary, '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-']);
            const current = await stat(file);
            if (current.size !== original.size || current.mtimeMs !== original.mtimeMs) throw new Error('Le fichier source a changé pendant le traitement.');
            const optimized = await stat(temporary);
            entry.durationSeconds = after.duration;
            if (optimized.size >= original.size) {
                entry.status = 'keep_original';entry.message = 'Déjà bien compressé : utilisez le fichier original.';
                entry.platformUploadReady = original.size <= 1024 ** 3;
                log('  Aucun gain : utilisez le fichier original.');
            } else {
                // Atomic exclusive publication: even another run cannot overwrite a result.
                await link(temporary, target);
                entry.status = 'optimized';entry.optimizedBytes = optimized.size;
                entry.platformUploadReady = optimized.size <= 1024 ** 3;
                entry.savedPercent = Math.round((1 - optimized.size / original.size) * 100);
                entry.outputSha256 = await checksum(target);
                log(`  Vérifié : ${entry.savedPercent} % de place économisée. Durée et résolution conservées.`);
            }
            if (!entry.platformUploadReady) log('  Ce fichier dépasse encore la limite actuelle de 1 Go de la plateforme.');
        } catch (error) {
            entry.status = 'failed';entry.message = error.message; log(`  Échec : ${error.message}`);
        } finally {
            // Only the unique temporary file created by this run is removed. Originals never are.
            if (temporary) await unlink(temporary).catch(() => {});
        }
        report.files.push(entry);
    }
    const reportPath = join(realDestination, `compression-report-${Date.now()}-${randomUUID().slice(0,8)}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
    log(`Terminé. Rapport : ${reportPath}`);
    return { ...report, reportPath };
}

export async function main(args = process.argv.slice(2)) {
    if (!args.length || args.includes('--help')) {
        console.log('Usage : node backend/scripts/optimize-replays.js <vidéo ou dossier> [--output dossier] [--crf 23] [--preset medium] [--threads 2] [--recursive]');
        return;
    }
    const input = args.shift(), options = {};
    while (args.length) {
        const flag = args.shift();
        if (flag === '--recursive') { options.recursive = true; continue; }
        if (!['--output', '--crf', '--preset', '--threads'].includes(flag) || !args.length) throw new Error('Option invalide : ' + flag);
        options[flag.slice(2)] = ['--crf','--threads'].includes(flag) ? Number(args.shift()) : args.shift();
    }
    const result = await optimizeReplays(input, options);
    if (result.files.some(file => file.status === 'failed')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
