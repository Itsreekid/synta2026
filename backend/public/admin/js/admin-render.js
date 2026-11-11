/* Serialize untrusted text for HTML templates and quoted attributes.
 * Keep untrusted values out of script, CSS, and event attributes.
 */
function adminText(value) {
    const text = document.createElement('span');
    text.textContent = String(value ?? '');
    return text.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
