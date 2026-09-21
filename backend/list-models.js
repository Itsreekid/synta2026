import dotenv from "dotenv";
dotenv.config();

async function listModels() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        
        if (data.models) {
            console.log("Available Gemini 1.5 Models:");
            data.models.forEach(m => {
                if (m.name.includes("1.5")) console.log(" -", m.name);
            });
        } else {
            console.log(data);
        }
    } catch (e) {
        console.error(e);
    }
}
listModels();
