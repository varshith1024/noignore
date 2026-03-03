const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../prismaClient");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/* =========================
   REGISTER
========================= */
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: { username, email, password: hashedPassword }
    });

    res.json({ message: "User Registered 😤" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ message: "Login successful 😤", token });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   SEARCH USERS
========================= */
router.get("/search/:username", authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = req.userId;

    if (!username?.trim()) return res.json([]);

    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            username: {
              startsWith: username,
              mode: "insensitive"
            }
          },
          { id: { not: currentUserId } }
        ]
      },
      select: {
        id: true,
        username: true,
        email: true
      }
    });

    res.json(users);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   SEND FRIEND REQUEST
========================= */
router.post("/send-request/:receiverId", authMiddleware, async (req, res) => {
  try {
    const senderId = req.userId;
    const { receiverId } = req.params;

    if (senderId === receiverId) {
      return res.status(400).json({ message: "Cannot send request to yourself" });
    }

    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId, status: "PENDING" },
          { senderId: receiverId, receiverId: senderId, status: "PENDING" }
        ]
      }
    });

    if (existingRequest) {
      return res.status(400).json({ message: "Request already pending" });
    }

    await prisma.friendRequest.create({
      data: { senderId, receiverId }
    });

    res.json({ message: "Friend request sent 😤" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   ACCEPT FRIEND REQUEST
========================= */
router.post("/accept-request/:requestId", authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.userId;

    const request = await prisma.friendRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.receiverId !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: "ACCEPTED" }
    });

    await prisma.friend.create({
      data: {
        user1: request.senderId,
        user2: request.receiverId
      }
    });

    res.json({ message: "Friend request accepted 😤" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   GET FRIENDS
========================= */
router.get("/friends", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const friendships = await prisma.friend.findMany({
      where: {
        OR: [{ user1: userId }, { user2: userId }]
      }
    });

    const friendIds = friendships.map(f =>
      f.user1 === userId ? f.user2 : f.user1
    );

    const friends = await prisma.user.findMany({
      where: { id: { in: friendIds } },
      select: { id: true, username: true, email: true }
    });

    res.json(friends);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   SEND MESSAGE
========================= */
router.post("/send-message/:receiverId", authMiddleware, async (req, res) => {
  try {
    const senderId = req.userId;
    const { receiverId } = req.params;
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ message: "Message cannot be empty" });
    }

    const message = await prisma.message.create({
      data: { senderId, receiverId, content }
    });

    res.json(message);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   GET CONVERSATION
========================= */
router.get("/messages/:friendId", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { friendId } = req.params;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId }
        ]
      },
      orderBy: { createdAt: "asc" }
    });

    // ✅ MARK MESSAGES AS READ HERE
    await prisma.message.updateMany({
      where: {
        senderId: friendId,
        receiverId: userId,
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    res.json(messages);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;