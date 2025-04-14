import express from "express";
import dotenv from "dotenv"
import { WebSocketServer } from "ws";
import db from "./src/config/db.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
    res.status(200).json({ message: "Hey!!! Server is working fine!" });
});

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});

// WebSocket Server (attached to HTTP server)
const wss = new WebSocketServer({ server });

let activeTeachers = {};

wss.on("connection", (ws) => {
    console.log("🔵 New client connected");

    ws.on("message", (message) => {
        try {
            const messageString = message.toString();
            const teacherData = JSON.parse(messageString);
            const { email, name } = teacherData; // Extract name and email

            if (!email) {
                console.warn("⚠️ Email is missing in the message");
                ws.send(JSON.stringify({ error: "Email is required" }));
                return;
            }

            console.log(`📩 Received data from: ${email}`);

            const currentTime = new Date();

            db.query(
                "UPDATE teachers SET status = 'active', last_seen = ? WHERE email = ?",
                [currentTime, email],
                (err, result) => {
                    if (err) {
                        console.error("❌ Database error:", err);
                        ws.send(JSON.stringify({ error: "Database error" }));
                        return;
                    }

                    if (result.affectedRows === 0) {
                        console.warn(`⚠️ No teacher found with email: ${email}`);
                    } else {
                        console.log(`✅ Teacher ${name || email} marked as active`);
                    }
                    sendUpdatedList();
                }
            );
            activeTeachers[email] = ws;
            console.log("🟢 Active teachers:", Object.keys(activeTeachers));
        } catch (err) {
            console.error("❌ Error parsing message:", err);
            ws.send(JSON.stringify({ error: "Invalid message format" }));
        }
    });

    ws.on("close", () => {
        for (let email in activeTeachers) {
            if (activeTeachers[email] === ws) {
                const lastSeenTime = new Date();

                db.query(
                    "UPDATE teachers SET status='inactive', last_seen=? WHERE email=?",
                    [lastSeenTime, email],
                    (err) => {
                        if (err) {
                            console.error("❌ Error updating teacher status in DB:", err);
                        }
                        delete activeTeachers[email];
                        sendUpdatedList();
                    }
                );
            }
        }
        console.log("🔴 A client disconnected");
    });
});

function sendUpdatedList() {
    db.query("SELECT name, email, status, last_seen FROM teachers", (err, results) => {
        if (err) {
            console.error("❌ Error fetching teacher list from DB:", err);
            return;
        }

        const formattedResults = results.map((teacher) => {
            const lastSeen = new Date(teacher.last_seen);
            const currentDate = new Date();

            if (lastSeen.toDateString() === currentDate.toDateString()) {
                teacher.last_seen = lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else {
                teacher.last_seen = lastSeen.toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
            }
            return teacher;
        });

        console.log("📢 Sending updated teacher list:", formattedResults);
        const data = JSON.stringify(formattedResults);

        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    });
}



