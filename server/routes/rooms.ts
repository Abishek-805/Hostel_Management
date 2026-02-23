import express from 'express';
import Room from '../models/Room';
import User from '../models/User';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Get all rooms (Scoped by Block)
router.get('/', authMiddleware, async (req: any, res) => {
  try {
    // Allow overriding hostelBlock via query for multi-hostel management
    const hostelBlock = (req.query.hostelBlock as string) || req.user.hostelBlock;

    if (!hostelBlock) {
      return res.status(400).json({ error: 'Hostel block is required' });
    }

    const rooms = await Room.find({
      hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, 'i') }
    }).lean();

    const roomOccupancy = await User.aggregate([
      { $match: { hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, 'i') } } },
      { $project: { roomNumber: { $toLower: { $trim: { input: "$roomNumber" } } } } },
      { $group: { _id: "$roomNumber", count: { $sum: 1 } } }
    ]);

    const occupancyMap = new Map(roomOccupancy.map(r => [r._id, r.count]));

    const roomsWithOccupancy = rooms.map((room: any) => ({
      ...room,
      currentOccupancy: occupancyMap.get(room.roomNumber.toLowerCase()) || 0
    }));

    res.json(roomsWithOccupancy);
  } catch (error) {
    console.error("Error fetching all rooms:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get rooms by specific block letter (A, B, C, D)
router.get('/block/:block', authMiddleware, async (req: any, res) => {
  try {
    const { block } = req.params;
    // Allow overriding hostelBlock via query
    const hostelBlock = (req.query.hostelBlock as string) || req.user.hostelBlock;

    if (!hostelBlock) {
      return res.status(400).json({ error: 'Hostel block is required' });
    }

    const query: any = {
      hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, 'i') }
    };

    if (block) {
      const blockStr = block.toString().toUpperCase();
      query.$or = [
        { block: blockStr },
        { roomNumber: { $regex: new RegExp(`^${blockStr}`, 'i') } }
      ];
    }

    const rooms = await Room.find(query).lean();

    // Auto-repair missing 'block' fields for rooms found via regex
    for (const room of rooms) {
      if (!room.block && room.roomNumber) {
        const derived = room.roomNumber.charAt(0).toUpperCase();
        if (derived >= 'A' && derived <= 'Z') {
          await Room.findByIdAndUpdate(room._id, { block: derived });
        }
      }
    }

    // Use aggregation to get counts per room (count all users - students and admins)
    const roomOccupancy = await User.aggregate([
      { $match: { hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, 'i') } } },
      { $project: { roomNumber: { $toLower: { $trim: { input: "$roomNumber" } } } } },
      { $group: { _id: "$roomNumber", count: { $sum: 1 } } }
    ]);

    const occupancyMap = new Map(roomOccupancy.map(r => [r._id, r.count]));

    const roomsWithOccupancy = rooms.map((room: any) => ({
      ...room,
      currentOccupancy: occupancyMap.get(room.roomNumber.toLowerCase()) || 0
    }));

    res.json(roomsWithOccupancy);
  } catch (error) {
    console.error("Error fetching rooms by block:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get specific room
router.get('/:roomNumber/:hostelBlock', authMiddleware, async (req: any, res) => {
  try {
    const { roomNumber, hostelBlock } = req.params;

    if (req.user.hostelBlock?.trim().toLowerCase() !== hostelBlock?.trim().toLowerCase() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized access to this block' });
    }

    let room = await Room.findOne({ roomNumber, hostelBlock }).lean();

    // Dynamic Occupancy Calculation
    const realTimeOccupancy = await User.countDocuments({ roomNumber, hostelBlock });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({
      ...room,
      currentOccupancy: realTimeOccupancy
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create room (Admin Only - Auto Block)
router.post('/', authMiddleware, async (req: any, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { roomNumber, capacity, block, hostelBlock: bodyHostelBlock } = req.body;
    const hostelBlock = (bodyHostelBlock || req.user.hostelBlock)?.trim();

    if (!hostelBlock) {
      return res.status(400).json({ error: 'Hostel block is required' });
    }

    const existingRoom = await Room.findOne({
      roomNumber,
      hostelBlock: { $regex: new RegExp(`^${hostelBlock}$`, 'i') }
    });

    if (existingRoom) {
      return res.status(400).json({ error: 'Room already exists in this block' });
    }

    const room = new Room({
      roomNumber,
      hostelBlock: hostelBlock.trim(),
      block: block || (roomNumber ? roomNumber.charAt(0).toUpperCase() : undefined),
      capacity,
      currentOccupancy: 0
    });

    await room.save();
    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update room
router.put('/:id', authMiddleware, async (req: any, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    // Ensure Admin can only edit their block's rooms
    const room = await Room.findOneAndUpdate(
      {
        _id: req.params.id,
        hostelBlock: req.user.hostelBlock
      },
      req.body,
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ error: 'Room not found or unauthorized' });
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete room
router.delete('/:id', authMiddleware, async (req: any, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const room = await Room.findOneAndDelete({
      _id: req.params.id,
      hostelBlock: req.user.hostelBlock
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found or unauthorized' });
    }
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Suggest a vacant room
router.get('/suggest/:hostelBlock', authMiddleware, async (req: any, res) => {
  try {
    const { hostelBlock } = req.params;

    // Find rooms that are not full
    const rooms = await Room.find({
      hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, 'i') }
    }).lean();

    // Get current occupancy for all rooms in this block
    const roomOccupancy = await User.aggregate([
      { $match: { hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, 'i') } } },
      { $group: { _id: "$roomNumber", count: { $sum: 1 } } }
    ]);

    const occupancyMap = new Map(roomOccupancy.map(r => [r._id, r.count]));

    const availableRooms = rooms.filter(room => {
      const current = occupancyMap.get(room.roomNumber) || 0;
      return current < room.capacity;
    });

    if (availableRooms.length === 0) {
      return res.status(404).json({ error: 'No available rooms found' });
    }

    // Sort by occupancy (ascending) to suggest the most vacant room
    availableRooms.sort((a, b) => {
      const occA = occupancyMap.get(a.roomNumber) || 0;
      const occB = occupancyMap.get(b.roomNumber) || 0;
      return occA - occB;
    });

    res.json({
      ...availableRooms[0],
      currentOccupancy: occupancyMap.get(availableRooms[0].roomNumber) || 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Swap students between rooms
router.post('/swap', authMiddleware, async (req: any, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { studentAId, studentBId } = req.body;

    if (!studentAId || !studentBId) {
      return res.status(400).json({ error: 'Both student IDs are required' });
    }

    const [studentA, studentB] = await Promise.all([
      User.findById(studentAId),
      User.findById(studentBId)
    ]);

    if (!studentA || !studentB) {
      return res.status(404).json({ error: 'One or both students not found' });
    }

    if (studentA.hostelBlock !== req.user.hostelBlock || studentB.hostelBlock !== req.user.hostelBlock) {
      return res.status(403).json({ error: 'Unauthorized to swap students from another block' });
    }

    const roomA = studentA.roomNumber;
    const roomB = studentB.roomNumber;

    studentA.roomNumber = roomB;
    studentB.roomNumber = roomA;

    await Promise.all([studentA.save(), studentB.save()]);

    res.json({ message: 'Rooms swapped successfully', studentA, studentB });
  } catch (error) {
    console.error("Swap error:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;