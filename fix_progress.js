import pool from './backend/config/db.js';

async function run() {
  try {
    console.log('Fixing enrollment progress...');
    const res = await pool.query(`
      UPDATE enrollments e
      SET 
        completed_lessons = COALESCE(sub.completed_count, 0),
        progress = CASE 
          WHEN COALESCE(sub.total_count, 0) = 0 THEN 0 
          ELSE ROUND((COALESCE(sub.completed_count, 0)::numeric / sub.total_count) * 100)
        END
      FROM (
        SELECT 
          m.course_id,
          lp.user_id,
          (SELECT COUNT(l2.id) FROM lessons l2 JOIN modules m2 ON l2.module_id = m2.id WHERE m2.course_id = m.course_id) as total_count,
          COUNT(lp.id) FILTER (WHERE lp.completed = true) as completed_count
        FROM lessons l
        JOIN modules m ON l.module_id = m.id
        LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
        WHERE lp.user_id IS NOT NULL
        GROUP BY m.course_id, lp.user_id
      ) sub
      WHERE e.course_id = sub.course_id AND e.user_id = sub.user_id;
    `);
    console.log('Fixed rows:', res.rowCount);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
