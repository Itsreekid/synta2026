# 📅 نظام إدارة الأحداث / Events Management System

## كيفية إضافة حدث جديد / How to Add a New Event

1. افتح ملف `events.js` في مجلد `data`
   Open the `events.js` file in the `data` folder

2. انسخ أحد الأحداث الموجودة
   Copy one of the existing events

3. عدّل البيانات التالية:
   Modify the following data:
   - **title**: عنوان الحدث بالعربية
   - **date**: التاريخ بصيغة "YYYY-MM-DD" (مثال: "2025-02-15")
   - **time**: الوقت بصيغة 24 ساعة "HH:MM" (مثال: "18:00")
   - **description**: وصف الحدث
   - **icon**: أي إيموجي تريده (📚, 🏆, 💻, إلخ)
   - **color**: لون الحدود (مثال: "#ff7b1a")

4. احفظ الملف وقم بتحديث الصفحة
   Save the file and refresh the page

## مثال / Example

```javascript
{
    title: "ورشة عمل JavaScript",
    date: "2025-03-15",
    time: "20:00",
    description: "تعلم أساسيات جافا سكريبت الحديثة",
    icon: "⚡",
    color: "#F7DF1E"
}
```

## ملاحظات / Notes

- ✅ الأحداث تظهر تلقائياً حسب التاريخ
  Events automatically appear based on date

- ❌ الأحداث التي مضى تاريخها تُخفى تلقائياً
  Past events are automatically hidden

- 🔄 لا تحتاج لتعديل أي ملف آخر
  You don't need to modify any other files
