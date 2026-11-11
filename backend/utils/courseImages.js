export const COURSE_IMAGE_PREFIX = "Courses-th/";
export const MAX_COURSE_IMAGE_BYTES = 5 * 1024 * 1024;

export function isCourseImageKey(key) {
    return typeof key === "string" && key.startsWith(COURSE_IMAGE_PREFIX) &&
        key.length <= 1024 && !/[\\\u0000-\u001f\u007f]/.test(key) &&
        key.split("/").every(part => part && part !== "." && part !== "..") &&
        /\.(?:png|jpe?g|gif|webp|avif)$/i.test(key);
}

export function courseImagePath(key) {
    return "/api/content/course-image/" + encodeURIComponent(key);
}

export function decodeCourseImage(data) {
    if (typeof data !== "string" || data.length > Math.ceil(MAX_COURSE_IMAGE_BYTES / 3) * 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
    const bytes = Buffer.from(data, "base64");
    if (bytes.length > MAX_COURSE_IMAGE_BYTES || bytes.toString("base64") !== data) return null;

    const png = bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const gif = ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6));
    const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    const avif = bytes.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(bytes.toString("ascii", 8, 12));
    if (png) return { bytes, extension: "png", contentType: "image/png" };
    if (jpeg) return { bytes, extension: "jpg", contentType: "image/jpeg" };
    if (gif) return { bytes, extension: "gif", contentType: "image/gif" };
    if (webp) return { bytes, extension: "webp", contentType: "image/webp" };
    if (avif) return { bytes, extension: "avif", contentType: "image/avif" };
    return null;
}
