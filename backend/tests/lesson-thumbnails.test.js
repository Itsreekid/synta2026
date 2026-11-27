import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isLessonId, lessonThumbnailKey } from "../services/lesson-thumbnails.js";

test("lesson thumbnail keys only accept lesson UUIDs", () => {
  const id = "6f9a4298-374d-47c2-bb7e-e4d477dbb54b";
  assert.equal(lessonThumbnailKey(id), `lesson-thumbnails/${id}.jpg`);
  assert.equal(lessonThumbnailKey(id.toUpperCase()), `lesson-thumbnails/${id}.jpg`);
  for (const bad of ["../../secret", "x", "", null, `${id}/../x`, `${id}.jpg`]) {
    assert.equal(isLessonId(bad), false);
    assert.throws(() => lessonThumbnailKey(bad));
  }
});

test("thumbnail routes keep their auth middleware and never log lesson access", async () => {
  const content = await readFile(new URL("../routes/content.js", import.meta.url), "utf8");
  const admin = await readFile(new URL("../routes/admin-api.js", import.meta.url), "utf8");
  assert.match(content, /router\.get\("\/lesson-thumbnails", authApiMiddleware,/);
  const studentRoute = content.slice(content.indexOf('"/lesson-thumbnails"'), content.indexOf('router.get("/course-image'));
  assert.doesNotMatch(studentRoute, /lesson_progress/, "listing thumbnails must not count as opening a lesson");
  for (const route of ["/video-url\", requireAdmin", "/thumbnail-upload-url\", requireAdmin", "/thumbnail-status\", requireAdmin"]) {
    assert.ok(admin.includes(route), route);
  }
});
