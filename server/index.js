const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const multer = require("multer");
const { Low } = require("lowdb");
const { JSONFile } = require("lowdb/node");
const { nanoid } = require("nanoid");
const os = require("os");

// ====== GET LOCAL IP ADDRESS ======
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ====== HELPER FUNCTION FOR DYNAMIC BASE URL ======
function getBaseUrl(req) {
  const forwardedHost = req.get('x-forwarded-host');
  const forwardedProto = req.get('x-forwarded-proto');
  
  if (forwardedHost && forwardedProto) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  
  return `${req.protocol}://${req.get('host')}`;
}

// ====== DATABASE SETUP ======
const dbFile = path.join(__dirname, "db.json");

if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(
    dbFile,
    JSON.stringify({ rooms: [], notes: [], posts: [] }, null, 2)
  );
}

const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { rooms: [], notes: [], posts: [] });

async function initDB() {
  await db.read();
  db.data ||= { rooms: [], notes: [], posts: [] };
  await db.write();
}

// ====== FIXED ROOMS ======
const FIXED_ROOMS = [
  { id: "sc1", name: "อาคาร SC.01", category: "คณะวิทยาศาสตร์", description: "อาคารเรียน นิติวิทยาศาสตร์" },
  { id: "sc2", name: "ตึกกลม SC.02", category: "คณะวิทยาศาสตร์", description: "อาคารเรียนรวม" },
  { id: "sc3", name: "อาคาร SC.03", category: "คณะวิทยาศาสตร์", description: "อาคารเรียน สาขาวิชาชีววิทยา" },
  { id: "sc4", name: "อาคาร SC.04", category: "คณะวิทยาศาสตร์", description: "อาคารเรียน สาขาวิชาเคมี" },
  { id: "sc5", name: "อาคาร SC.05", category: "คณะวิทยาศาสตร์", description: "สโมสรนักศึกษาคณะวิทยาศาสตร์" },
  { id: "sc6", name: "อาคาร SC.06", category: "คณะวิทยาศาสตร์", description: "อาคารเรียน สาขาวิชาสถิติ สำนักงานคณบดี" },
  { id: "sc7", name: "อาคาร SC.07", category: "คณะวิทยาศาสตร์", description: "อาคารเรียน สาขาวิชาจุลชีววิทยา ชีวเคมี คณิตศาสตร์" },
  { id: "sc8", name: "อาคาร SC.08", category: "คณะวิทยาศาสตร์", description: "อาคารเรียน สาขาวิชาวิทยาศาสตร์สิ่งแวดล้อม" },
  { id: "sc9", name: "อาคารวิทยวิภาส SC.09", category: "คณะวิทยาศาสตร์", description: "อาคารเรียน สาขาวิชาฟิสิกส์ และ คณะวิทยาลัยการคอมพิวเตอร์" },
  { id: "h8", name: "หอพักสวัสดิการนักศึกษา (วรเรสซิเดนซ์)", category: "หอพักนักศึกษา", description: "หอพักนักศึกษา อาคาร 8 หลัง" },
  { id: "h9", name: "หอพักนพรัตน์", category: "หอพักนักศึกษา", description: "หอพักนักศึกษา อาคาร 9 หลัง" },
  { id: "h_in", name: "หอพักวรอินเตอร์", category: "หอพักนักศึกษา", description: "หอพักนักศึกษา 4 หลัง (วรอินเตอร์)" },
];

async function initFixedRooms() {
  await db.read();
  let hasChanges = false;
  FIXED_ROOMS.forEach((room) => {
    const exists = db.data.rooms.find((r) => r.id === room.id);
    if (!exists) {
      db.data.rooms.push({ ...room, createdAt: new Date().toISOString() });
      hasChanges = true;
      console.log(`✅ สร้างห้อง: ${room.name}`);
    }
  });
  if (hasChanges) await db.write();
}

// ====== EXPRESS SETUP ======
const app = express();

// ✅ ตั้งค่า CORS ให้รองรับทุก origin
app.use(cors({ 
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"]
}));

app.use(express.json());

// ====== FILE UPLOADS ======
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `${Date.now()}-${nanoid(6)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ====== HTTP + SOCKET SERVER ======
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// ====== HELPER ======
function tryRemoveUploadedFile(fileUrl) {
  if (!fileUrl) return;
  try {
    const filename = path.basename(new URL(fileUrl).pathname);
    const filePath = path.join(uploadsDir, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn("tryRemoveUploadedFile:", err?.message || err);
  }
}

// ====== ROUTES ======
app.get("/", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "🚀 Server is running!",
    timestamp: new Date().toISOString(),
    endpoints: {
      rooms: "/rooms",
      search: "/search-rooms?query=",
      posts: "/posts",
      uploadImage: "/upload-image"
    }
  });
});

app.get("/rooms", async (req, res) => {
  await db.read();
  res.json({ rooms: db.data.rooms });
});

app.get("/search-rooms", async (req, res) => {
  const { query } = req.query;
  await db.read();
  if (!query || query.trim() === "") return res.json({ rooms: db.data.rooms });

  const search = query.toLowerCase().trim();
  const filtered = db.data.rooms.filter(
    (r) =>
      r.name.toLowerCase().includes(search) ||
      (r.category && r.category.toLowerCase().includes(search)) ||
      (r.description && r.description.toLowerCase().includes(search))
  );
  res.json({ rooms: filtered, query: search });
});

// ✅ UPLOAD IMAGE ROUTE (รองรับ Dynamic URL)
app.post("/upload-image", upload.single("image"), async (req, res) => {
  try {
    console.log("📸 Upload image request received");
    console.log("📁 File:", req.file);
    console.log("📦 Body:", req.body);
    
    if (!req.file) {
      console.log("❌ No file uploaded");
      return res.status(400).json({ ok: false, error: "No file uploaded" });
    }

    const roomId = req.body.roomId;
    const color = req.body.color || "color-yellow";
    
    if (!roomId) {
      console.log("❌ No roomId provided");
      return res.status(400).json({ ok: false, error: "roomId is required" });
    }

    await db.read();
    
    // เช็คว่าห้องมีจริงไหม
    const roomExists = db.data.rooms.some((r) => r.id === roomId);
    if (!roomExists) {
      console.log("❌ Room not found:", roomId);
      return res.status(400).json({ ok: false, error: "Room not found" });
    }

    // ✅ ใช้ Dynamic Base URL
    const fileUrl = `${getBaseUrl(req)}/uploads/${req.file.filename}`;
    console.log("🖼️ Image URL:", fileUrl);

    // สร้าง note สำหรับรูปภาพ
    const noteId = nanoid(10);
    const note = {
      id: noteId,
      roomId: roomId,
      type: "image",
      fileUrl: fileUrl,
      x: Math.random() * 400 + 100,
      y: Math.random() * 400 + 100,
      color: color,
      author: "anon",
      timestamp: new Date().toISOString(),
    };

    db.data.notes.push(note);
    await db.write();

    // ส่ง real-time update ให้คนในห้อง
    io.in(roomId).emit("noteCreated", note);

    console.log("✅ Image note created:", noteId);
    res.json({ ok: true, note });

  } catch (error) {
    console.error("❌ Error uploading image:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/posts", async (req, res) => {
  await db.read();
  const { roomId } = req.query;
  let posts = db.data.posts;
  if (roomId) posts = posts.filter((p) => p.roomId === roomId);
  res.json({ posts });
});

// ✅ POST /posts ใช้ Dynamic URL
app.post("/posts", upload.single("image"), async (req, res) => {
  try {
    const { title, author, description, contactLink, category, roomId, x, y } = req.body;
    await db.read();

    const roomExists = db.data.rooms.some((r) => r.id === roomId);
    if (!roomExists) return res.status(400).json({ error: "Room not found" });

    // ✅ ใช้ Dynamic URL แทน hardcode
    const imageUrl = req.file
      ? `${getBaseUrl(req)}/uploads/${req.file.filename}`
      : null;

    const newPost = {
      id: nanoid(10),
      title: title || "Untitled Post",
      author: author || "Anonymous",
      description: description || "",
      image: imageUrl,
      contactLink: contactLink || "",
      category: category || "ทั่วไป",
      roomId,
      position: { x: parseInt(x) || 100, y: parseInt(y) || 100 },
      createdAt: new Date().toISOString(),
    };

    db.data.posts.push(newPost);
    await db.write();

    io.in(roomId).emit("postCreated", newPost);
    res.json(newPost);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    await db.read();
    const idx = db.data.posts.findIndex((p) => p.id === id);
    
    if (idx === -1) {
      return res.status(404).json({ error: "Post not found" });
    }

    db.data.posts[idx] = { ...db.data.posts[idx], ...updates };
    await db.write();

    io.in(db.data.posts[idx].roomId).emit("postUpdated", db.data.posts[idx]);
    res.json(db.data.posts[idx]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.read();
    const post = db.data.posts.find((p) => p.id === id);
    
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    db.data.posts = db.data.posts.filter((p) => p.id !== id);
    await db.write();

    if (post.image) tryRemoveUploadedFile(post.image);

    io.in(post.roomId).emit("postDeleted", { id, roomId: post.roomId });
    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ====== SOCKET.IO ======
const activeUsers = new Map();

io.on("connection", (socket) => {
  console.log("✅ socket connected:", socket.id);

  socket.on("joinRoom", async (roomId) => {
    const rId = String(roomId);
    socket.join(rId);
    
    if (!activeUsers.has(rId)) {
      activeUsers.set(rId, new Set());
    }
    activeUsers.get(rId).add(socket.id);

    await db.read();
    
    socket.emit("initialNotes", db.data.notes.filter((n) => n.roomId === rId));
    socket.emit("initialPosts", db.data.posts.filter((p) => p.roomId === rId));
    socket.emit("activeUsers", activeUsers.get(rId).size);
    
    socket.to(rId).emit("userJoined", { 
      socketId: socket.id, 
      roomId: rId,
      activeCount: activeUsers.get(rId).size
    });
    
    console.log(`📌 ${socket.id} joined room ${rId} (${activeUsers.get(rId).size} users online)`);
  });

  socket.on("leaveRoom", (roomId) => {
    const rId = String(roomId);
    socket.leave(rId);
    
    if (activeUsers.has(rId)) {
      activeUsers.get(rId).delete(socket.id);
      
      socket.to(rId).emit("userLeft", {
        socketId: socket.id,
        roomId: rId,
        activeCount: activeUsers.get(rId).size
      });
      
      if (activeUsers.get(rId).size === 0) {
        activeUsers.delete(rId);
      }
    }
    
    console.log(`📌 ${socket.id} left room ${rId}`);
  });

  // ====== NOTE EVENTS ======
  socket.on("createNote", async (note) => {
    await db.read();
    const roomId = String(note.roomId);
    if (!db.data.rooms.some((r) => r.id === roomId)) return;
    
    const newNote = {
      id: nanoid(10),
      roomId,
      type: note.type || "text",
      content: note.content || "",
      x: note.x || 100,
      y: note.y || 100,
      align: note.align || "left",
      color: note.color || "color-yellow",
      author: note.author || "anon",
      timestamp: new Date().toISOString(),
    };
    
    db.data.notes.push(newNote);
    await db.write();
    
    io.in(roomId).emit("noteCreated", newNote);
    console.log(`📝 Note created in ${roomId} by ${socket.id}`);
  });

  socket.on("updateNote", async (note) => {
    if (!note.id) return;
    
    await db.read();
    const idx = db.data.notes.findIndex((n) => n.id === note.id);
    if (idx === -1) return;
    
    db.data.notes[idx] = { ...db.data.notes[idx], ...note };
    await db.write();
    
    io.in(db.data.notes[idx].roomId).emit("noteUpdated", db.data.notes[idx]);
    console.log(`✏️ Note ${note.id} updated in ${db.data.notes[idx].roomId}`);
  });

  socket.on("deleteNote", async (payload) => {
    const id = payload?.id ?? payload;
    
    await db.read();
    const note = db.data.notes.find((n) => n.id === id);
    if (!note) return;
    
    db.data.notes = db.data.notes.filter((n) => n.id !== id);
    await db.write();
    
    if (note.fileUrl) tryRemoveUploadedFile(note.fileUrl);
    
    io.in(note.roomId).emit("noteDeleted", { id, roomId: note.roomId });
    console.log(`🗑️ Note ${id} deleted from ${note.roomId}`);
  });

  // ====== POST EVENTS ======
  socket.on("updatePost", async (post) => {
    if (!post.id) return;
    
    await db.read();
    const idx = db.data.posts.findIndex((p) => p.id === post.id);
    if (idx === -1) return;
    
    db.data.posts[idx] = { ...db.data.posts[idx], ...post };
    await db.write();
    
    io.in(post.roomId).emit("postUpdated", db.data.posts[idx]);
    console.log(`✏️ Post ${post.id} updated in ${post.roomId}`);
  });

  socket.on("deletePost", async (payload) => {
    const id = payload?.id ?? payload;
    
    await db.read();
    const post = db.data.posts.find((p) => p.id === id);
    if (!post) return;
    
    db.data.posts = db.data.posts.filter((p) => p.id !== id);
    await db.write();
    
    if (post.image) tryRemoveUploadedFile(post.image);
    
    io.in(post.roomId).emit("postDeleted", { id, roomId: post.roomId });
    console.log(`🗑️ Post ${id} deleted from ${post.roomId}`);
  });

  socket.on("typing", ({ roomId, noteId, isTyping }) => {
    socket.to(roomId).emit("userTyping", {
      socketId: socket.id,
      noteId,
      isTyping
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ socket disconnected:", socket.id);
    
    activeUsers.forEach((users, roomId) => {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        
        io.in(roomId).emit("userLeft", {
          socketId: socket.id,
          roomId,
          activeCount: users.size
        });
        
        if (users.size === 0) {
          activeUsers.delete(roomId);
        }
      }
    });
  });
});

// ====== START SERVER ======
(async () => {
  await initDB();
  await initFixedRooms();

  const PORT = process.env.PORT || 4000;
  const HOST = "0.0.0.0"; // รับ connection จากทุก network interface
  const LOCAL_IP = getLocalIP();
  
  server.listen(PORT, HOST, () => {
    console.log("\n🎉 =================================");
    console.log("🌐 Server running successfully!");
    console.log("🎉 =================================\n");
    console.log(`📍 Local:    http://localhost:${PORT}`);
    console.log(`📍 Network:  http://${LOCAL_IP}:${PORT}`);
    console.log(`🔌 Socket.IO ready for real-time connections`);
    console.log(`📁 Uploads:  ${uploadsDir}\n`);
    console.log("💡 Tips:");
    console.log("   - ใช้ localhost สำหรับเครื่องตัวเอง");
    console.log(`   - ใช้ http://${LOCAL_IP}:${PORT} สำหรับเพื่อนในเครือข่ายเดียวกัน`);
    console.log("   - ใช้ ngrok สำหรับเข้าถึงจาก Internet\n");
  });
})();