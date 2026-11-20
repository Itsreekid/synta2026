// Shared embedded media creation for course and standalone session replays.
window.createSessionReplayPlayer = function (source, title) {
    const url = new URL(source, window.location.href);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Lien du replay invalide.');
    let embed;
    if (url.protocol === 'https:' && url.hostname === 'drive.google.com') {
        const id = url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/)?.[1] || url.searchParams.get('id');
        if (!id || !/^[\w-]+$/.test(id)) throw new Error('Lien Google Drive invalide.');
        embed = new URL(`https://drive.google.com/file/d/${id}/preview`);
        if (url.searchParams.has('resourcekey')) embed.searchParams.set('resourcekey', url.searchParams.get('resourcekey'));
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) {
        const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
        if (!id || !/^[\w-]+$/.test(id)) throw new Error('Lien YouTube invalide.');
        embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
        embed.searchParams.set('autoplay', '1');
    } else if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)) {
        const id = url.pathname.split('/').filter(Boolean).pop();
        if (!/^\d+$/.test(id)) throw new Error('Lien Vimeo invalide.');
        embed = new URL(`https://player.vimeo.com/video/${id}`);
        embed.searchParams.set('autoplay', '1');
    }
    const player = document.createElement(embed ? 'iframe' : 'video');
    player.title = title || 'Replay de la séance';
    if (embed) {
        player.src = embed.href;
        player.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
        player.allowFullscreen = true;
    } else {
        player.src = url.href;
        player.controls = true;
        player.autoplay = true;
        player.playsInline = true;
    }
    return player;
};
