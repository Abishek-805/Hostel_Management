import express from 'express';
import { authMiddleware } from '../middleware/auth';
import ExcelJS from 'exceljs';
import Announcement from '../models/Announcement';
import FoodPoll from '../models/FoodPoll';

const router = express.Router();

const formatPollForClient = (poll: any, userId: string) => ({
  ...(poll || {}),
  foods: (poll?.foods || []).map((f: any) => ({
    ...f,
    voteCount: Array.isArray(f.votes) ? f.votes.length : 0,
    hasVoted: Array.isArray(f.votes)
      ? f.votes.some((v: any) => v.toString() === userId)
      : false,
    votes: [],
  })),
});

// GET all polls for user's hostel block
router.get('/', authMiddleware, async (req: any, res) => {
  try {
    const hostelBlock = req.user?.hostelBlock;
    if (!hostelBlock) {
      return res.status(400).json({ error: 'User not assigned to a hostel block' });
    }

    const blockPolls = await FoodPoll.find({ hostelBlock })
      .sort({ createdAt: -1 })
      .lean();

    res.json(blockPolls.map((poll: any) => formatPollForClient(poll, req.user.id)));
  } catch (error) {
    console.error('Error fetching polls:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single poll by ID
router.get('/:pollId', authMiddleware, async (req: any, res) => {
  try {
    const poll = await FoodPoll.findById(req.params.pollId).lean();
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    if (poll.hostelBlock !== req.user?.hostelBlock) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(formatPollForClient(poll, req.user.id));
  } catch (error) {
    console.error('Error fetching poll:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create new poll (admin only)
router.post('/', authMiddleware, async (req: any, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can create polls' });
    }

    const { title, description, foods } = req.body;
    const hostelBlock = req.user?.hostelBlock;

    if (!title || !foods || !Array.isArray(foods) || foods.length === 0) {
      return res.status(400).json({ error: 'Title and at least one food item required' });
    }

    if (!hostelBlock) {
      return res.status(400).json({ error: 'User not assigned to a hostel block' });
    }

    const sanitizedFoods = foods
      .map((name: any) => (typeof name === 'string' ? name.trim() : ''))
      .filter((name: string) => name.length > 0);

    if (sanitizedFoods.length === 0) {
      return res.status(400).json({ error: 'At least one valid food item required' });
    }

    const newPoll = await FoodPoll.create({
      hostelBlock,
      title,
      description: description || '',
      foods: sanitizedFoods.map((name: string) => ({
        name: name.trim(),
        votes: [],
      })),
      createdBy: req.user.id,
      isActive: true,
    });

    // Automatically create an announcement for the poll
    try {
      const announcement = new Announcement({
        title: `📊 New Food Poll: ${title}`,
        content: `Vote for your favorite dishes! ${sanitizedFoods.length} options available.`,
        isEmergency: false,
        isHoliday: false,
        pollId: newPoll._id.toString(),
        hostelBlock,
      });
      await announcement.save();
    } catch (announcementError) {
      console.error('Failed to create poll announcement:', announcementError);
      // Don't fail the poll creation if announcement fails
    }

    const createdPoll = await FoodPoll.findById(newPoll._id).lean();
    res.json(formatPollForClient(createdPoll, req.user.id));
  } catch (error) {
    console.error('Error creating poll:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST vote on a food item
router.post('/:pollId/vote', authMiddleware, async (req: any, res) => {
  try {
    const { foodId } = req.body;
    const pollId = req.params.pollId;
    const userId = req.user.id;

    if (!foodId) {
      return res.status(400).json({ error: 'Food ID required' });
    }

    const poll = await FoodPoll.findById(pollId);
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    if (poll.hostelBlock !== req.user?.hostelBlock) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (!poll.isActive) {
      return res.status(400).json({ error: 'Poll is closed' });
    }

    const foodItem = poll.foods.find((f: any) => f._id.toString() === foodId);
    if (!foodItem) {
      return res.status(404).json({ error: 'Food item not found' });
    }

    // Check if user already voted for this food
    const alreadyVoted = foodItem.votes.some((id: any) => id.toString() === userId);
    if (alreadyVoted) {
      // Remove vote (toggle)
      foodItem.votes = foodItem.votes.filter((id: any) => id.toString() !== userId);
    } else {
      // Remove user's vote from other foods (one vote per poll per user)
      poll.foods.forEach((f: any) => {
        f.votes = f.votes.filter((id: any) => id.toString() !== userId);
      });
      // Add new vote
      foodItem.votes.push(userId);
    }

    poll.markModified('foods');
    await poll.save();

    const refreshedPoll = await FoodPoll.findById(pollId).lean();
    res.json(formatPollForClient(refreshedPoll, userId));

  } catch (error) {
    console.error('Error voting:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET export poll results as Excel
router.get('/:pollId/export', authMiddleware, async (req: any, res) => {
  try {
    const pollId = req.params.pollId;
    const poll = await FoodPoll.findById(pollId).lean();

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    if (poll.hostelBlock !== req.user?.hostelBlock) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Sort foods by vote count (highest to lowest)
    const sortedFoods = [...poll.foods].sort(
      (a: any, b: any) => b.votes.length - a.votes.length,
    );
    const totalVotes = sortedFoods.reduce((sum: number, f: any) => sum + f.votes.length, 0);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Food Poll Results');

    // Add title and metadata
    worksheet.columns = [
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'Food Item', key: 'food', width: 30 },
      { header: 'Votes', key: 'votes', width: 12 },
      { header: 'Percentage', key: 'percentage', width: 15 }
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4CAF50' }
    };

    // Add data rows
    sortedFoods.forEach((food: any, index: number) => {
      const percentage = totalVotes > 0 ? ((food.votes.length / totalVotes) * 100).toFixed(2) : '0.00';
      worksheet.addRow({
        rank: index + 1,
        food: food.name,
        votes: food.votes.length,
        percentage: `${percentage}%`
      });
    });

    // Add summary
    worksheet.addRow({});
    worksheet.addRow({
      food: 'Total Votes',
      votes: totalVotes
    });

    // Generate filename based on poll title and creation date
    const dateStr = poll.createdAt.toLocaleDateString('en-IN').replace(/\//g, '-');
    const filename = `${poll.title}-${dateStr}.xlsx`;

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting poll:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE close poll (admin only)
router.delete('/:pollId', authMiddleware, async (req: any, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can close polls' });
    }

    const pollId = req.params.pollId;
    const poll = await FoodPoll.findById(pollId);

    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    if (poll.hostelBlock !== req.user?.hostelBlock) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    poll.isActive = false;
    await poll.save();

    // Delete associated announcement when poll closes
    try {
      await Announcement.deleteOne({ pollId: pollId });
    } catch (err) {
      console.error(`Error deleting announcement for poll ${pollId}:`, err);
      // Don't fail the poll close if announcement deletion fails
    }

    const closedPoll = await FoodPoll.findById(pollId).lean();
    res.json(formatPollForClient(closedPoll, req.user.id));
  } catch (error) {
    console.error('Error closing poll:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
