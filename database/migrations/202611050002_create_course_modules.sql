CREATE TABLE IF NOT EXISTS course_modules (
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (course_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_course_modules_module ON course_modules(module_id);
CREATE INDEX IF NOT EXISTS idx_course_modules_course_order ON course_modules(course_id, order_index);

INSERT INTO course_modules (course_id, module_id, order_index)
SELECT course_id, id, order_index FROM modules
ON CONFLICT (course_id, module_id) DO NOTHING;
