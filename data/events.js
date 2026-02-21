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
        zoomLink: "https://us06web.zoom.us/j/85679107582?pwd=NRqxAbY22nt2szhVg8CSaDYacIBRqK.1 ",
        target_classes: ["bac"],
        target_branches: ["all"]
    },
    {
        title: "حصة مجانية في مادة الاعلامية ",
        date: "2026-02-22",
        time: "20:00",
        description: {
            line1: "حصة مباشرة لمراجعة لامتحان التأليفي في مادة الاعلامية",
            line2: ""
        },
        icon: "💻",
        color: "#28a745",
        zoomLink: "https://us06web.zoom.us/j/81958080044?pwd=Gc5jiQ5ZXvHRd8BtWMjWYvYKbo3Vam.1",
        target_classes: ["bac"],
        target_branches: ["economie"]
    },
    // New targeted session for Bac informatique
    {
        title: "حصة مجانية في مادة الاعلامية ",
        date: "2026-02-23",
        time: "20:00",
        description: {
            line1: "حصة مباشرة لمراجعة لامتحان التأليفي في مادة الاعلامية",
            line2: ""
        },
        icon: "💻",
        color: "#28a745",
        zoomLink: "https://us06web.zoom.us/j/81213427093?pwd=FdBwfquDCwS7tIMaiPiiL9C21PgFGg.1",
        target_classes: ["bac"],
        target_branches: ["informatique"]
    },
];

// Instructions:
// - To add an event: Copy an existing event object and modify its values
// - To target specific users:
//   - target_classes: ["bac", "7eme", etc.] or ["all"]
//   - target_branches: ["economie", "technique", "sciences", etc.] or ["all"]
// - Date format: "YYYY-MM-DD"
// - Time format: "HH:MM"
// - Available icons: Any emoji (📚, 🏆, 💻, 🎮, 🎨, 📱, etc.)
// - Colors: Any valid CSS color (#ff7b1a, #28a745, #007bff, etc.)
// - zoomLink: The Zoom meeting URL
