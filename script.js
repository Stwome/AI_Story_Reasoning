document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("generateBtn")
        .addEventListener("click", generateStory);
});

async function generateStory() {
    document.getElementById("output").innerText = "Generating story...";

    const data = {
        char1: document.getElementById("char1").value,
        attr1: document.getElementById("attr1").value,
        abil1: document.getElementById("abil1").value,
        char2: document.getElementById("char2").value,
        attr2: document.getElementById("attr2").value,
        abil2: document.getElementById("abil2").value
    };

    try {
        const res = await fetch("https://calm-waterfall-59bf.swmedinets.workers.dev", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await res.json();
        document.getElementById("output").innerText = result.story;

    } catch (err) {
        console.error(err);
        document.getElementById("output").innerText = "Error generating story.";
    }
}
