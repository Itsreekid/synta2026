function resolveCourseImage(value) {
    if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return null;
    const source = value.trim();
    if (source.startsWith('Courses-th/')) return '/api/content/course-image/' + encodeURIComponent(source);
    if (/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/]+={0,2}$/i.test(source)) return source;
    if (!/^(?:https?:\/\/|\/|\.\.?\/)/i.test(source)) return null;
    try {
        const url = new URL(source, location.href);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}
