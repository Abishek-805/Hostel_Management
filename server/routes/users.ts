import express from 'express';
import User from '../models/User';
import { authMiddleware } from '../middleware/auth';
import { getFaceEmbedding } from '../services/faceRecognition';

const router = express.Router();

// Helper function to escape regex special characters
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to build case-insensitive regex
function buildCaseInsensitiveRegex(value: string): RegExp {
  return new RegExp(`^${escapeRegex(value.trim())}$`, 'i');
}

// Get all users (Admin view - Scoped by Block)
router.get('/', authMiddleware, async (req: any, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const hostelBlock = (req.query.hostelBlock as string) || req.user.hostelBlock;

    const users = await User.find({
      hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, 'i') }
    }).select('-password');
    res.json(users);
  } catch (error) {
    console.error("Error fetching all users:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get roommates (Public/Student view - Scoped by Room & Block)
router.get('/roommates/:roomNumber/:hostelBlock', authMiddleware, async (req: any, res) => {
  try {
    const { roomNumber, hostelBlock } = req.params;

    // Security check: Use case-insensitive comparison for block
    if (req.user.hostelBlock?.trim().toLowerCase() !== hostelBlock?.trim().toLowerCase() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized access to this block' });
    }

    const roommates = await User.find({
      roomNumber: buildCaseInsensitiveRegex(roomNumber),
      hostelBlock: buildCaseInsensitiveRegex(hostelBlock)
    }).select('name registerId phone profileImage');

    console.log(`Fetching roommates: roomNumber=${roomNumber}, hostelBlock=${hostelBlock}, found: ${roommates.length}`);
    
    res.json(roommates);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user by ID (Self or Admin of same block)
router.get('/:id', authMiddleware, async (req: any, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Authz check
    const isSelf = req.user.id === user.id;
    const isAdminOfBlock = req.user.role === 'admin' && req.user.hostelBlock === user.hostelBlock;

    if (!isSelf && !isAdminOfBlock) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user (Self or Admin of same block)
router.put('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { name, phone, roomNumber, hostelBlock, profileImage } = req.body;

    const userToUpdate = await User.findById(req.params.id);
    if (!userToUpdate) return res.status(404).json({ error: 'User not found' });

    // Authz check
    const isSelf = req.user.id.toString() === userToUpdate._id.toString();
    const isAdminOfBlock = req.user.role === 'admin' && req.user.hostelBlock === userToUpdate.hostelBlock;

    console.log(`Update Attempt for ${userToUpdate.name}: isSelf=${isSelf}, isAdmin=${isAdminOfBlock}`);

    if (!isSelf && !isAdminOfBlock) {
      console.log(`Unauthorized update by ${req.user.id} on ${userToUpdate._id}`);
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updateFields: any = {};
    if (name !== undefined) updateFields.name = name;
    if (phone !== undefined) updateFields.phone = phone;
    if (roomNumber !== undefined) updateFields.roomNumber = roomNumber;

    // Admins cannot change the hostelBlock of a student to another block.
    // They can only manage rooms within the student's (and their own) block.
    if (hostelBlock !== undefined && (req.user.role !== 'admin' || hostelBlock === userToUpdate.hostelBlock)) {
      updateFields.hostelBlock = hostelBlock;
    }
    if (profileImage !== undefined) {
      updateFields.profileImage = profileImage;
      console.log(`📤 Processing profile image: ${(profileImage.length / 1024).toFixed(1)}KB`);

      // Extract face embeddings from the profile image
      try {
        console.log('🔍 Starting face detection and embedding extraction...');
        const startTime = Date.now();
        const embedding = await getFaceEmbedding(profileImage);
        const elapsed = Date.now() - startTime;

        updateFields.faceEmbedding = Array.from(embedding);
        console.log(`✅ Face embedding extracted successfully (${elapsed}ms): 128 dimensions`);
      } catch (error: any) {
        console.error('❌ Face extraction error:', error);
        const message = error?.message || "Face processing error";
        const statusCode = message.includes("currently unavailable") ? 503 : 400;
        return res.status(statusCode).json({ error: message });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    ).select('-password');

    if (user) {
      console.log(`✅ Update successful for ${user.name} (ID: ${user._id})`);
      console.log(`   - Profile Image: ${user.profileImage ? 'Present' : 'Missing'}`);
      console.log(`   - Face Embedding: ${user.faceEmbedding ? 'Present (' + user.faceEmbedding.length + ' dims)' : 'Missing'}`);
    }

    res.json(user);
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user (Admin of same block)
router.delete('/:id', authMiddleware, async (req: any, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const userToDelete = await User.findById(req.params.id);
    if (!userToDelete) return res.status(404).json({ error: 'User not found' });

    if (userToDelete.hostelBlock !== req.user.hostelBlock) {
      return res.status(403).json({ error: 'Unauthorized to delete user from another block' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;