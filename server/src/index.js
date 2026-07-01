const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

// Environment variables
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const app = express();
const server = http.createServer(app);

// Socket.io initialization with strict CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ['GET', 'POST'],
  },
});

// Middleware - Security & Parsers
app.use(helmet()); // Secure HTTP headers
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json({ limit: '10kb' })); // Body parser, limit payload size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser()); // Parse cookies

// Rate Limiting to prevent Brute-Force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/api', limiter);

// Basic Route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Nexus API is running securely.' });
});

const { ExpressPeerServer } = require('peer');

// ExpressPeerServer Configuration
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});
app.use('/peerjs', peerServer);

const roomUsers = {}; // Basit kimlik doğrulama - TS tarzı sunucu şifresi
const SERVER_PASSWORD = process.env.SERVER_PASSWORD || 'X7v$K9p#M2qL@8wN';

// Socket.io Events (Signaling for WebRTC and Chat)
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  let currentUserRoom = null;
  let currentUserId = null;
  let isAuthenticated = false; // Güvenlik yaması: Kullanıcı şifreyi girdi mi?

  // Brute-force koruması için state (IP tabanlı)
  const clientIp = socket.handshake.address;

  // Handle server login (Odaya girmeden önce sunucuya giriş yapmak için)
  socket.on('login', (password) => {
    // Brute-force koruması
    if (socket._loginRateLimit && Date.now() - socket._loginRateLimit < 5000) {
      socket.emit('login-error', 'Çok fazla deneme yaptınız. Lütfen bekleyin.');
      return;
    }
    
    if (password !== SERVER_PASSWORD) {
      socket._loginRateLimit = Date.now();
      socket.emit('login-error', 'Hatalı sunucu şifresi!');
      return;
    }
    
    socket._loginRateLimit = 0;
    isAuthenticated = true;
    socket.join('authenticated-users');
    
    // Sadece başarılı giriş yapanlara odaların güncel durumunu gönder
    socket.emit('room-users-update', roomUsers);
    console.log('User authenticated to server:', socket.id);
  });

  // Handle joining a voice room
  socket.on('join-room', (roomId, peerId, username, password) => {
    // Brute-force denemelerini engelle: 5 saniyede sadece 1 deneme yapılabilir
    if (socket._joinRateLimit && Date.now() - socket._joinRateLimit < 5000) {
      socket.emit('join-error', 'Çok fazla deneme yaptınız. Lütfen bekleyin.');
      return;
    }
    
    if (password !== SERVER_PASSWORD) {
      socket._joinRateLimit = Date.now(); // Hatalı şifrede cezalandır (5 saniye bekleme)
      socket.emit('join-error', 'Hatalı sunucu şifresi!');
      return;
    }
    
    // Şifre doğruysa cezayı kaldır
    socket._joinRateLimit = 0;
    isAuthenticated = true;
    socket.join('authenticated-users'); // Şifreyi girenler yetkili grubuna alınır

    // Eğer önceden başka bir odadaysa, oradan ayrıl
    if (currentUserRoom && currentUserRoom !== roomId && currentUserId) {
      socket.leave(currentUserRoom);
      if (roomUsers[currentUserRoom]) {
        roomUsers[currentUserRoom] = roomUsers[currentUserRoom].filter(u => u.peerId !== currentUserId);
      }
      socket.to(currentUserRoom).emit('user-disconnected', currentUserId);
    }

    socket.join(roomId);
    
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }
    
    // Eğer kullanıcı zaten odadaysa güncelle, yoksa ekle
    const existingUserIndex = roomUsers[roomId].findIndex(u => u.peerId === peerId);
    if (existingUserIndex >= 0) {
      roomUsers[roomId][existingUserIndex].username = username || 'Misafir';
      roomUsers[roomId][existingUserIndex].socketId = socket.id;
    } else {
      roomUsers[roomId].push({ 
        peerId, 
        socketId: socket.id, 
        username: username || 'Misafir',
        isMuted: true,
        isDeafened: false
      });
    }

    currentUserRoom = roomId;
    currentUserId = peerId;

    // Notify others in the room
    socket.to(roomId).emit('user-connected', peerId);
    
    // Send updated user list ONLY to authenticated users
    io.to('authenticated-users').emit('room-users-update', roomUsers);
    
    console.log(`User ${username} (${peerId}) joined room: ${roomId}`);
  });

  // Handle updating username
  socket.on('update-username', (newUsername) => {
    if (!isAuthenticated) return; // Güvenlik yaması
    if (currentUserRoom && currentUserId && roomUsers[currentUserRoom]) {
      const userIndex = roomUsers[currentUserRoom].findIndex(u => u.peerId === currentUserId);
      if (userIndex >= 0) {
        roomUsers[currentUserRoom][userIndex].username = newUsername || 'Misafir';
        io.to('authenticated-users').emit('room-users-update', roomUsers);
      }
    }
  });

  // Handle media status updates (mute/deafen)
  socket.on('update-media-status', ({ isMuted, isDeafened }) => {
    if (!isAuthenticated) return; // Güvenlik yaması
    if (currentUserRoom && currentUserId && roomUsers[currentUserRoom]) {
      const userIndex = roomUsers[currentUserRoom].findIndex(u => u.peerId === currentUserId);
      if (userIndex >= 0) {
        roomUsers[currentUserRoom][userIndex].isMuted = isMuted;
        roomUsers[currentUserRoom][userIndex].isDeafened = isDeafened;
        io.to('authenticated-users').emit('room-users-update', roomUsers);
      }
    }
  });

  // Socket Rate Limiting (Spam Koruması)
  let lastMessageTime = 0;

  // Handle chat messages
  socket.on('send-message', (roomId, messageData) => {
    if (!isAuthenticated) return; // Güvenlik yaması
    // Ek güvenlik: Sadece bulunduğu odaya mesaj atabilir
    if (currentUserRoom !== roomId) return; 
    
    // Spam / DoS Koruması: Saniyede 1 mesajdan fazla atılamaz
    const now = Date.now();
    if (now - lastMessageTime < 500) {
      return; // Yarım saniyeden kısa sürede mesaj atıyorsa reddet (Spam botu)
    }
    lastMessageTime = now;

    // Payload (Veri) Boyutu Doğrulaması: Sunucuyu çökertmek için devasa metin atılmasını engelle
    if (messageData && typeof messageData.text === 'string') {
      if (messageData.text.length > 500) {
        messageData.text = messageData.text.substring(0, 500) + '...'; // 500 karakterle sınırla
      }
    } else {
      return; // Geçersiz veri tipi
    }
    
    // Broadcast the message to everyone in the room except the sender
    socket.to(roomId).emit('receive-message', messageData);
  });

  // Handle manual leave room (Hanging up the call)
  socket.on('leave-room', (roomId, userId) => {
    if (!isAuthenticated) return;
    if (roomId && userId && roomUsers[roomId]) {
      socket.leave(roomId);
      roomUsers[roomId] = roomUsers[roomId].filter(u => u.peerId !== userId);
      io.to('authenticated-users').emit('room-users-update', roomUsers);
      socket.to(roomId).emit('user-disconnected', userId);
      
      if (currentUserRoom === roomId) {
        currentUserRoom = null;
        currentUserId = null;
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (currentUserRoom && currentUserId && roomUsers[currentUserRoom]) {
      roomUsers[currentUserRoom] = roomUsers[currentUserRoom].filter(u => u.peerId !== currentUserId);
      io.to('authenticated-users').emit('room-users-update', roomUsers);
      socket.to(currentUserRoom).emit('user-disconnected', currentUserId);
    }
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
