require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const prisma = require("./prismaClient");

const authRoutes = require("./routes/auth");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);

/* =========================
   SOCKET CONNECTION
========================= */
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // JOIN ROOM
  socket.on("join", (userId) => {
    console.log("User joined room:", userId);
    socket.join(userId);
  });

  // SEND MESSAGE
  socket.on("sendMessage", async ({ senderId, receiverId, content }) => {
    try {
      console.log("Message received from:", senderId);
      console.log("Sending to receiver:", receiverId);

      // Emit real-time message
      io.to(receiverId).emit("receiveMessage", {
        senderId,
        content
      });

      console.log("Message emitted in real-time");

      /* =========================
         REPEATING IGNORE SYSTEM
      ========================== */

      const interval = setInterval(async () => {
        try {
          console.log("Checking unread messages...");

          const unreadMessages = await prisma.message.findMany({
            where: {
              senderId,
              receiverId,
              isRead: false
            }
          });

          console.log("Unread count:", unreadMessages.length);

          if (unreadMessages.length > 0) {
            console.log("Sending ignore warning...");
            io.to(receiverId).emit("ignoreWarning", {
              message: "You are ignoring messages 😤"
            });
          } else {
            console.log("Messages read. Stopping reminders.");
            clearInterval(interval);
          }

        } catch (err) {
          console.log("Interval error:", err.message);
          clearInterval(interval);
        }
      }, 5000); // Every 5 seconds

    } catch (error) {
      console.log("Socket error:", error.message);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(5000, () => {
  console.log("Server running on port 5000 😤🔥");
});