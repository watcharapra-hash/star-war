document.addEventListener('DOMContentLoaded', () => {

  const API_URL = "http://10.224.109.120:4000";
  const socket = io(API_URL);

  const board = document.getElementById("board");
  const createBtn = document.getElementById("create-note");
  const searchInput = document.getElementById("search-input");
  const searchSuggestions = document.getElementById("search-suggestions");
  const roomContainer = document.getElementById("room-container");
  const imageInput = document.getElementById("image-input");

  const createPostBtn = document.getElementById("create-post");
  const postModal = document.getElementById("post-modal");
  const postForm = document.getElementById("post-form");

  let currentRoom = null;
  let selectedNoteId = null;
  let currentNoteColor = 'color-yellow';
  let zoomLevel = 1;

  // ========== FIXED ROOMS ==========
  const FIXED_ROOMS = [
    { id: "sc1", name: "อาคาร SC.01", category: "คณะวิทยาศาสตร์" },
    { id: "sc2", name: "ตึกกลม SC.02", category: "คณะวิทยาศาสตร์" },
    { id: "sc3", name: "อาคาร SC.03", category: "คณะวิทยาศาสตร์" },
    { id: "sc4", name: "อาคาร SC.04", category: "คณะวิทยาศาสตร์" },
    { id: "sc5", name: "อาคาร SC.05", category: "คณะวิทยาศาสตร์" },
    { id: "sc6", name: "อาคาร SC.06", category: "คณะวิทยาศาสตร์" },
    { id: "sc7", name: "อาคาร SC.07", category: "คณะวิทยาศาสตร์" },
    { id: "sc8", name: "อาคาร SC.08", category: "คณะวิทยาศาสตร์" },
    { id: "sc9", name: "อาคารวิทยวิภาส SC.09", category: "คณะวิทยาศาสตร์" },
    { id: "h8", name: "หอพักสวัสดิการนักศึกษา", category: "หอพักนักศึกษา" },
    { id: "h9", name: "หอพักนพรัตน์", category: "หอพักนักศึกษา" },
    { id: "h_in", name: "หอพักวรอินเตอร์", category: "หอพักนักศึกษา" }
  ];

  // ========== ZOOM CONTROLS ==========
  function createZoomControls() {
    const zoomDiv = document.createElement('div');
    zoomDiv.className = 'zoom-controls';
    zoomDiv.innerHTML = `
      <button class="zoom-btn" id="zoom-out">−</button>
      <span class="zoom-level">100%</span>
      <button class="zoom-btn" id="zoom-in">+</button>
      <button class="zoom-btn" id="zoom-reset">⟲</button>
    `;
    document.body.appendChild(zoomDiv);

    document.getElementById('zoom-in').addEventListener('click', () => {
      zoomLevel = Math.min(zoomLevel + 0.1, 2);
      applyZoom();
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
      zoomLevel = Math.max(zoomLevel - 0.1, 0.5);
      applyZoom();
    });

    document.getElementById('zoom-reset').addEventListener('click', () => {
      zoomLevel = 1;
      applyZoom();
    });
  }

  function applyZoom() {
    board.style.transform = `scale(${zoomLevel})`;
    board.style.transformOrigin = 'top left';
    document.querySelector('.zoom-level').textContent = Math.round(zoomLevel * 100) + '%';
  }

  // ========== AI SUGGESTIONS ==========
  function getSuggestions(query) {
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) {
      return FIXED_ROOMS.slice(0, 5).map(r => r.name);
    }

    const results = FIXED_ROOMS.filter(room =>
      room.name.toLowerCase().includes(lowerQuery) ||
      room.id.toLowerCase().includes(lowerQuery) ||
      room.category.toLowerCase().includes(lowerQuery)
    );

    return results.length > 0 ? results.map(r => r.name) : FIXED_ROOMS.slice(0, 5).map(r => r.name);
  }

  // ========== SEARCH FUNCTIONS ==========
  searchInput.addEventListener("input", async (e) => {
    const query = e.target.value.trim();
    
    if (query.length > 0 && query.length <= 3) {
      const suggestions = getSuggestions(query);
      searchSuggestions.innerHTML = suggestions
        .map(s => `<div class="suggestion-item">🔍 ${s}</div>`)
        .join("");
      searchSuggestions.style.display = "block";
      
      document.querySelectorAll(".suggestion-item").forEach(item => {
        item.addEventListener("click", () => {
          const text = item.textContent.replace("🔍 ", "").trim();
          searchInput.value = text;
          searchSuggestions.style.display = "none";
          searchRooms(text);
        });
      });
    } else {
      searchSuggestions.style.display = "none";
    }
    
    await searchRooms(query);
  });

  // ========== CATEGORY FILTER ==========
  const categorySelect = document.getElementById("category-select");
  let currentCategory = "";

  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      currentCategory = categorySelect.value;
      searchRooms(searchInput.value);
    });
  }

  async function searchRooms(query = "") {
    try {
      const res = await fetch(`${API_URL}/search-rooms?query=${encodeURIComponent(query)}`);
      const data = await res.json();

      roomContainer.innerHTML = "<h3>รายการห้อง</h3>";

      let filteredRooms = data.rooms;
      if (currentCategory) {
        filteredRooms = filteredRooms.filter(r => r.category === currentCategory);
      }

      if (filteredRooms.length === 0) {
        roomContainer.innerHTML += `
          <p class="no-results">
            ไม่พบห้องในหมวดหมู่ที่เลือก
            <small>ลองเลือกหมวดหมู่อื่น</small>
          </p>
        `;
        return;
      }

      filteredRooms.forEach(r => {
        const div = document.createElement("div");
        div.className = "list-item";

        const btn = document.createElement("button");
        btn.innerHTML = `
          <div style="font-weight: 600;">${r.name}</div>
          <small style="opacity: 0.7; font-size: 11px; display: block; margin-top: 4px;">
            ${r.category || ''} - ${r.description || ''}
          </small>
        `;
        btn.className = "list-btn";
        btn.setAttribute("data-room-id", r.id);

        if (String(r.id) === String(currentRoom)) {
          btn.classList.add("active");
        }

        btn.onclick = () => joinRoom(r.id, r.name);
        div.appendChild(btn);
        roomContainer.appendChild(div);
      });

    } catch (error) {
      console.error("Error searching rooms:", error);
      roomContainer.innerHTML += "<p class='error-text'>เกิดข้อผิดพลาดในการโหลดห้อง</p>";
    }
  }

  // ========== ROOM FUNCTIONS ==========
  async function joinRoom(roomId, roomName = null) {
    currentRoom = String(roomId);
    localStorage.setItem("currentRoom", currentRoom);
    socket.emit("joinRoom", roomId);
    board.innerHTML = "";

    const roomNameEl = document.getElementById("current-room-name");
    const roomNameBoardEl = document.getElementById("current-room-name-board");
    
    if (!roomName) {
      const room = FIXED_ROOMS.find(r => r.id === roomId);
      roomName = room ? room.name : "ไม่พบชื่อห้อง";
    }
    
    if (roomNameEl) roomNameEl.textContent = roomName;
    if (roomNameBoardEl) roomNameBoardEl.textContent = roomName;

    document.querySelectorAll("#room-container .list-btn").forEach(btn => {
      btn.classList.remove("active");
    });
    
    const selectedBtn = document.querySelector(`#room-container .list-btn[data-room-id="${roomId}"]`);
    if (selectedBtn) {
      selectedBtn.classList.add("active");
    }

    document.getElementById("note-controls").style.display = "flex";

    const boardHint = document.querySelector(".board-hint");
    if (boardHint) boardHint.style.display = "none";

    try {
      const postsRes = await fetch(`${API_URL}/posts?roomId=${roomId}`);
      const postsData = await postsRes.json();
      if (postsData.posts) {
        postsData.posts.forEach(renderPost);
      }
    } catch (error) {
      console.error("Error loading posts:", error);
    }

    await searchRooms(searchInput.value);
  }

  // ========== POST MODAL ==========
  createPostBtn.addEventListener("click", () => {
    if (!currentRoom) {
      alert("⚠️ กรุณาเลือกห้องก่อนสร้างโพสต์");
      return;
    }
    postModal.style.display = "block";
  });

  const closeModalBtn = document.querySelector(".close");
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      postModal.style.display = "none";
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === postModal) {
      postModal.style.display = "none";
    }
  });

  postForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const title = document.getElementById("post-title").value;
    const author = document.getElementById("post-author").value;
    const description = document.getElementById("post-description").value;
    const contactLink = document.getElementById("post-contact").value;
    const imageFile = document.getElementById("post-image").files[0];
    
    const formData = new FormData();
    formData.append("title", title);
    formData.append("author", author || "Anonymous");
    formData.append("description", description);
    formData.append("contactLink", contactLink);
    formData.append("category", "ทั่วไป");
    formData.append("roomId", currentRoom);
    formData.append("x", Math.floor(Math.random() * 300 + 100));
    formData.append("y", Math.floor(Math.random() * 300 + 100));
    
    if (imageFile) {
      formData.append("image", imageFile);
    }
    
    try {
      const res = await fetch(`${API_URL}/posts`, {
        method: "POST",
        body: formData
      });
      
      if (res.ok) {
        postModal.style.display = "none";
        postForm.reset();
        showNotification("สร้างโพสต์สำเร็จ!");
      } else {
        const error = await res.json();
        alert("เกิดข้อผิดพลาด: " + (error.error || "ไม่สามารถสร้างโพสต์ได้"));
      }
    } catch (error) {
      console.error("Error creating post:", error);
      alert("เกิดข้อผิดพลาดในการสร้างโพสต์");
    }
  });

  // ========== SOCKET LISTENERS ==========
  socket.on("initialNotes", (data) => {
    let notes;
    if (Array.isArray(data)) {
      notes = data;
    } else if (data && Array.isArray(data.notes)) {
      if (String(data.roomId) !== String(currentRoom)) return;
      notes = data.notes;
    } else {
      console.warn("initialNotes payload unknown:", data);
      return;
    }

    document.querySelectorAll(".note").forEach(n => n.remove());
    notes.forEach(renderNote);
  });

  socket.on("noteCreated", (note) => {
    if (String(note.roomId) !== String(currentRoom)) return;
    renderNote(note);
  });

  socket.on("noteUpdated", (note) => {
    const el = document.getElementById(note.id);
    if (!el) return;

    if (note.x !== undefined) el.style.left = note.x + "px";
    if (note.y !== undefined) el.style.top = note.y + "px";

    const contentEl = el.querySelector(".note-content");
    if (contentEl && note.content !== undefined) {
      contentEl.textContent = note.content;
    }

    if (note.align) {
      el.style.textAlign = note.align;
    }
  });

  socket.on("noteDeleted", (payload) => {
    let id = null;
    let roomId = null;

    if (!payload) return;
    if (typeof payload === "string" || typeof payload === "number") {
      id = String(payload);
    } else if (payload.id) {
      id = String(payload.id);
      roomId = payload.roomId;
    }

    if (!id) return;
    if (roomId && String(roomId) !== String(currentRoom)) return;

    const el = document.getElementById(id);
    if (el) el.remove();
  });

  socket.on("initialPosts", (posts) => {
    document.querySelectorAll(".post").forEach(p => p.remove());
    posts.forEach(renderPost);
  });

  socket.on("postCreated", (post) => {
    if (String(post.roomId) !== String(currentRoom)) return;
    renderPost(post);
  });

  socket.on("postUpdated", (post) => {
    const el = document.getElementById(post.id);
    if (!el) return;

    if (post.position) {
      el.style.left = post.position.x + "px";
      el.style.top = post.position.y + "px";
    }
  });

  socket.on("postDeleted", (payload) => {
    const id = payload?.id ?? payload;
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  // ========== NOTE CONTROLS ==========
  document.getElementById("align-left").onclick = () => {
    if (!selectedNoteId) {
      showNotification("⚠️ กรุณาคลิกเลือกโน้ตก่อน");
      return;
    }
    socket.emit("updateNote", { id: selectedNoteId, roomId: currentRoom, align: "left" });
  };

  document.getElementById("align-center").onclick = () => {
    if (!selectedNoteId) {
      showNotification("⚠️ กรุณาคลิกเลือกโน้ตก่อน");
      return;
    }
    socket.emit("updateNote", { id: selectedNoteId, roomId: currentRoom, align: "center" });
  };

  document.getElementById("align-right").onclick = () => {
    if (!selectedNoteId) {
      showNotification("⚠️ กรุณาคลิกเลือกโน้ตก่อน");
      return;
    }
    socket.emit("updateNote", { id: selectedNoteId, roomId: currentRoom, align: "right" });
  };

  createBtn.addEventListener("click", () => {
    if (!currentRoom) {
      showNotification("⚠️ กรุณาเลือกห้องก่อน");
      return;
    }
    
    socket.emit("createNote", {
      roomId: currentRoom,
      type: "text",
      content: "",
      x: Math.random() * 400 + 100,
      y: Math.random() * 400 + 100,
      align: "left",
      color: currentNoteColor
    });
  });

  // ========== EMOJI & COLOR PICKER ==========
  const emojiCategories = [
    {
      emojis: ["😊", "😃", "😄", "😁", "😆", "🥰", "😍", "🤩", "😎", "🤗",
        "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💖",
        "👍", "👎", "👏", "🙏", "🤝", "👋", "🤙", "💪", "✌️", "🤞",
        "🎉", "🎊", "🎈", "🎁", "🎀", "🎂", "🎆", "🎇", "✨", "🌟",
        "🔥", "💯", "⭐", "💫", "💥", "💢", "💡", "💎", "🏆", "🎯"]
    }
  ];

  const colorList = [
    { name: '🟡 เหลือง', class: 'color-yellow' },
    { name: '🩷 ชมพู', class: 'color-pink' },
    { name: '🔵 ฟ้า', class: 'color-blue' },
    { name: '🟢 เขียว', class: 'color-green' },
    { name: '🟣 ม่วง', class: 'color-purple' },
    { name: '🟠 ส้ม', class: 'color-orange' }
  ];

  const emojiGrid = document.querySelector('.emoji-grid-inline');
  if (emojiGrid) {
    emojiCategories.forEach(category => {
      category.emojis.forEach(emoji => {
        const item = document.createElement('div');
        item.className = 'emoji-item';
        item.textContent = emoji;
        item.onclick = () => {
          if (!currentRoom) {
            showNotification("⚠️ กรุณาเข้าห้องก่อน");
            return;
          }
          
          socket.emit("createNote", {
            roomId: currentRoom,
            type: "text",
            content: emoji,
            x: Math.random() * 400 + 100,
            y: Math.random() * 400 + 100,
            align: "center",
            color: currentNoteColor
          });
          
          document.getElementById('emoji-dropdown').style.display = 'none';
        };
        emojiGrid.appendChild(item);
      });
    });
  }

  const colorGrid = document.querySelector('.color-grid-inline');
  if (colorGrid) {
    colorList.forEach(color => {
      const item = document.createElement('div');
      item.className = `color-item ${color.class}`;
      item.textContent = color.name;
      
      if (currentNoteColor === color.class) {
        item.classList.add('active');
      }
      
      item.onclick = () => {
        currentNoteColor = color.class;
        showNotification(`✅ เปลี่ยนสีเป็น ${color.name} แล้ว!`);
        
        document.querySelectorAll('.color-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        document.getElementById('color-dropdown').style.display = 'none';
      };
      colorGrid.appendChild(item);
    });
  }

  const emojiBtn = document.getElementById("emoji-btn");
  if (emojiBtn) {
    emojiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('emoji-dropdown');
      const colorDropdown = document.getElementById('color-dropdown');
      
      if (colorDropdown) colorDropdown.style.display = 'none';
      if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
      }
    });
  }

  const colorBtn = document.getElementById("color-picker-btn");
  if (colorBtn) {
    colorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdown = document.getElementById('color-dropdown');
      const emojiDropdown = document.getElementById('emoji-dropdown');
      
      if (emojiDropdown) emojiDropdown.style.display = 'none';
      if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
      }
    });
  }

  // ✅ แก้ไขส่วน Upload Image - เพิ่ม console.log เพื่อ debug
  imageInput.addEventListener("change", async (e) => {
    console.log("📸 Image input changed!");
    
    if (!currentRoom) {
      showNotification("⚠️ กรุณาเลือกห้องก่อน");
      imageInput.value = "";
      return;
    }
    
    if (!imageInput.files || !imageInput.files.length) {
      console.log("❌ No file selected");
      return;
    }

    const file = imageInput.files[0];
    console.log("📁 File:", file.name, file.type, file.size);
    
    const formData = new FormData();
    formData.append("image", file);
    formData.append("roomId", currentRoom);
    formData.append("color", currentNoteColor);

    try {
      console.log("🚀 Uploading to:", `${API_URL}/upload-image`);
      showNotification("⏳ กำลังอัปโหลด...");
      
      const res = await fetch(`${API_URL}/upload-image`, {
        method: "POST",
        body: formData
      });
      
      console.log("📡 Response status:", res.status);
      const data = await res.json();
      console.log("📦 Response data:", data);
      
      if (data.ok) {
        imageInput.value = "";
        showNotification("✅ อัปโหลดรูปภาพสำเร็จ!");
      } else {
        showNotification("❌ " + (data.error || "อัปโหลดไม่สำเร็จ"));
      }
    } catch (error) {
      console.error("❌ Error uploading image:", error);
      showNotification("❌ เกิดข้อผิดพลาดในการอัปโหลด");
    }
  });

  // ========== RENDER FUNCTIONS ==========
  function renderNote(note) {
    const div = document.createElement("div");
    div.className = "note " + (note.color || currentNoteColor);
    div.id = note.id;

    // ✅ แก้ไข: เพิ่ม user-select สำหรับการคลิกและแก้ไข
    div.style.userSelect = 'none';

    div.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".note").forEach(n => n.classList.remove("selected"));
      div.classList.add("selected");
      selectedNoteId = note.id;
    });

    const delBtn = document.createElement("button");
    delBtn.textContent = "×";
    delBtn.className = "delete-btn";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm("ต้องการลบโน้ตนี้ไหม?")) {
        socket.emit("deleteNote", { id: note.id, roomId: note.roomId });
      }
    };
    div.appendChild(delBtn);

    div.style.textAlign = note.align || "left";
    if (note.type === "image") div.classList.add("image");

    div.style.left = (note.x ?? 0) + "px";
    div.style.top = (note.y ?? 0) + "px";

    if (note.type === "image") {
      const img = document.createElement("img");
      img.src = note.fileUrl;
      img.className = "note-image";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "4px";
      img.draggable = false;
      div.appendChild(img);
    } else {
      const contentEl = document.createElement("div");
      contentEl.textContent = note.content ?? "";
      contentEl.className = "note-content";
      contentEl.style.cursor = "text";
      contentEl.style.userSelect = "text";

      // ✅ แก้ไข Double Click Handler
      function enableEditing(e) {
        e.stopPropagation();
        
        console.log("✏️ Double click detected on note:", note.id);
        
        const input = document.createElement("textarea");
        input.value = contentEl.textContent;
        input.className = "note-editor";
        input.style.width = "100%";
        input.style.height = "80px";
        input.style.padding = "8px";
        input.style.border = "2px solid #4CAF50";
        input.style.borderRadius = "4px";
        input.style.fontSize = "14px";
        input.style.resize = "none";
        input.style.fontFamily = "inherit";

        // บันทึกเมื่อ blur
        input.onblur = () => {
          const newText = input.value.trim();
          console.log("💾 Saving text:", newText);
          
          socket.emit("updateNote", {
            id: note.id,
            roomId: note.roomId,
            content: newText
          });
          
          contentEl.textContent = newText;
          div.replaceChild(contentEl, input);
          contentEl.ondblclick = enableEditing;
        };

        // Enter = บันทึก
        input.addEventListener("keydown", ev => {
          if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            input.blur();
          }
        });

        div.replaceChild(input, contentEl);
        input.focus();
        input.select();
      }

      contentEl.ondblclick = enableEditing;
      div.appendChild(contentEl);
    }

    makeDraggable(div, note.id, 'note');
    board.appendChild(div);
  }

  function renderPost(post) {
    const div = document.createElement("div");
    div.className = "post";
    div.id = post.id;

    div.style.left = (post.position?.x ?? 100) + "px";
    div.style.top = (post.position?.y ?? 100) + "px";

    const delBtn = document.createElement("button");
    delBtn.textContent = "×";
    delBtn.className = "delete-btn";
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm("ต้องการลบโพสต์นี้ไหม?")) {
        await fetch(`${API_URL}/posts/${post.id}`, { method: "DELETE" });
      }
    };
    div.appendChild(delBtn);

    div.addEventListener("click", (e) => {
      if (!e.target.classList.contains('delete-btn') && !e.target.classList.contains('post-contact')) {
        showPostDetail(post);
      }
    });

    if (post.image) {
      const img = document.createElement("img");
      img.src = post.image;
      img.className = "post-image";
      img.draggable = false;
      div.appendChild(img);
    }

    const title = document.createElement("h3");
    title.textContent = post.title;
    title.className = "post-title";
    div.appendChild(title);

    const author = document.createElement("p");
    author.textContent = `โดย: ${post.author}`;
    author.className = "post-author";
    div.appendChild(author);

    if (post.description) {
      const desc = document.createElement("p");
      desc.textContent = post.description.substring(0, 100) + (post.description.length > 100 ? "..." : "");
      desc.className = "post-description";
      div.appendChild(desc);
    }

    if (post.contactLink) {
      const link = document.createElement("a");
      link.href = post.contactLink;
      link.textContent = "ติดต่อ";
      link.className = "post-contact";
      link.target = "_blank";
      link.onclick = (e) => {
        e.stopPropagation();
      };
      div.appendChild(link);
    }

    makeDraggable(div, post.id, 'post');
    board.appendChild(div);
  }

  function showPostDetail(post) {
    const oldModal = document.getElementById('post-detail-modal');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'post-detail-modal';
    modal.className = 'post-detail-modal';
    modal.innerHTML = `
      <div class="post-detail-content">
        <span class="close">&times;</span>
        ${post.image ? `<img src="${post.image}" alt="${post.title}">` : ''}
        <h2>${post.title}</h2>
        <p class="post-author">โดย: ${post.author}</p>
        <p class="post-description">${post.description || ''}</p>
        ${post.contactLink ? `<a href="${post.contactLink}" target="_blank" class="post-contact">ติดต่อ</a>` : ''}
      </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'block';

    modal.querySelector('.close').onclick = () => {
      modal.style.display = 'none';
      modal.remove();
    };

    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
        modal.remove();
      }
    };
  }

  function makeDraggable(el, id, type) {
    let offsetX = 0, offsetY = 0, isDragging = false;
    let onMove = null;
    let onUp = null;

    el.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      isDragging = true;
      const rect = el.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      const boardRect = board.getBoundingClientRect();

      onMove = (ev) => {
        if (!isDragging) return;
        el.style.left = (ev.clientX - boardRect.left - offsetX) + "px";
        el.style.top  = (ev.clientY - boardRect.top - offsetY) + "px";
      };

      onUp = async (ev) => {
        if (!isDragging) return;
        isDragging = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);

        const x = parseInt(el.style.left || "0", 10);
        const y = parseInt(el.style.top || "0", 10);

        if (type === 'note') {
          socket.emit("updateNote", { id, x, y, roomId: currentRoom });
        } else if (type === 'post') {
          await fetch(`${API_URL}/posts/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ position: { x, y } })
          });
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    el.addEventListener("dragstart", e => e.preventDefault());
  }

  board.addEventListener("click", () => {
    document.querySelectorAll(".note").forEach(n => n.classList.remove("selected"));
    selectedNoteId = null;
  });

  const sidebar = document.getElementById("sidebar");
  const toggleSidebarBtn = document.getElementById("sidebar-toggle");
  toggleSidebarBtn.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });

  function showNotification(message, duration = 3000) {
    const oldNotif = document.querySelector('.notification-toast');
    if (oldNotif) oldNotif.remove();

    const notif = document.createElement('div');
    notif.className = 'notification-toast';
    notif.textContent = message;
    document.body.appendChild(notif);

    setTimeout(() => notif.classList.add('show'), 10);

    setTimeout(() => {
      notif.classList.remove('show');
      setTimeout(() => notif.remove(), 300);
    }, duration);
  }

  (async () => {
    await searchRooms("");
    createZoomControls();
    
    const savedRoom = localStorage.getItem("currentRoom");
    
    if (savedRoom) {
      setTimeout(() => {
        joinRoom(savedRoom);
      }, 100);
    }
  })();

});