// Events Configuration File
// Edit this file to manage upcoming events in the dashboard
// Add, remove, or modify events as needed

const upcomingEvents = [
    {
        title: "حصة مجانية في مادة الفلسفة ",
        date: "2026-02-06",
        time: "20:00",
        description: {
            line1: "حصة مباشرة في مادة الفلسفة لتلاميذة البكالوريا",
            line2: "شعب علمية"
        },    
        icon: "📚",
        color: "#ff7b1a",
        zoomLink: "https://us06web.zoom.us/j/85679107582?pwd=NRqxAbY22nt2szhVg8CSaDYacIBRqK.1 " 
    },
    {
        title:"حصة مجانية في مادة الاعلامية ",
        date: "2026-02-07",
        time: "20:00",
        description: {
            line1: "حصة مباشرة في مادة الاعلامية لتلاميذة شعب علمية",
            line2: "Chapitre : Les sous programmes"
        },
        icon: "💻",
        color: "#28a745",
        zoomLink: "https://us06web.zoom.us/j/85897834973?pwd=eHGWYmgsgmREPnyBA0URvraJTbt0aO.1"
    }

    /*      
    {
        title: "ورشة عمل: تطوير الويب",
        date: "2026-02-25",
        time: "19:00",
        description: "تعلم كيفية بناء مواقع الويب الحديثة",
        icon: "💻",
        color: "#007bff"
    },
    {
        title: "جلسة أسئلة وأجوبة مباشرة",
        date: "2026-03-01",
        time: "17:00",
        description: "اسأل أي شيء عن البرمجة والدورات",
        icon: "❓",
        color: "#6f42c1"
    }
    */
];

// Instructions:
// - To add an event: Copy an existing event object and modify its values
// - To remove an event: Delete the entire event object (don't forget to remove the comma)
// - Date format: "YYYY-MM-DD" (e.g., "2026-02-15")
// - Time format: "HH:MM" in 24-hour format (e.g., "18:00")
// - Available icons: Any emoji (📚, 🏆, 💻, 🎮, 🎨, 📱, etc.)
// - Colors: Any valid CSS color (#ff7b1a, #28a745, #007bff, etc.)
// - zoomLink: The Zoom meeting URL for the session (e.g., "https://zoom.us/j/1234567890")
// - Description: Use an object with line1 and line2 for two-line descriptions

// Example of adding a new event:
/*
{
    title: "عنوان الحدث",
    date: "2026-03-10",
    time: "19:30",
    description: {
        line1: "السطر الأول من الوصف",
        line2: "السطر الثاني من الوصف"
    },
    icon: "🎉",
    color: "#ff6b6b",
    zoomLink: "https://zoom.us/j/1234567890"
}
*/
