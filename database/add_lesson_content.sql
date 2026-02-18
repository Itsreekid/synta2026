-- Add content column to lessons table for quizzes or text-based lessons
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS content JSONB;

-- Example structure for a quiz lesson in the content column:
/*
{
  "questions": [
    {
      "id": "q1",
      "text": "Quelle est la capitale de la France ?",
      "options": ["Paris", "Lyon", "Marseille", "Lille"],
      "answer": "Paris",
      "category": "Math-Algebra"
    }
  ]
}
*/
