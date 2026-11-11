/* Serialize untrusted text for HTML templates and quoted attributes.
 * Keep untrusted values out of script, CSS, and event attributes.
 */
function adminText(value) {
    const text = document.createElement('span');
    text.textContent = String(value ?? '');
    return text.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function adminImageUrl(value, baseUrl = document.baseURI) {
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return null;
    const source = value.trim();
    if (!source) return null;
    if (/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/]+={0,2}$/i.test(source)) {
        return source;
    }
    try {
        const url = new URL(source, baseUrl);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
        return null;
    }
}
