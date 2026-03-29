const express = require('express');

const isAuthenticated = require('../middleware/isAuthenticated');
const Task = require('../models/Task');

const router = express.Router();

router.use(isAuthenticated);

router.get('/', async (req, res) => {
  const tasks = await Task.find({ owner: req.user._id }).sort({ date: 1, createdAt: 1 });
  return res.json(tasks);
});

router.post('/', async (req, res) => {
  const { title, notes = '', date } = req.body;
  const requestedStatus = req.body.status;

  const status = ['pending', 'partial', 'completed'].includes(requestedStatus)
    ? requestedStatus
    : req.body.completed
      ? 'completed'
      : 'pending';

  if (!title || !date) {
    return res.status(400).json({ message: 'title and date are required' });
  }

  const task = await Task.create({
    title,
    notes,
    date,
    status,
    completed: status === 'completed',
    owner: req.user._id,
  });

  return res.status(201).json(task);
});

router.patch('/:taskId', async (req, res) => {
  const updates = {
    title: req.body.title,
    notes: req.body.notes,
    date: req.body.date,
    status: req.body.status,
    completed: req.body.completed,
  };

  if (updates.status === undefined && updates.completed !== undefined) {
    updates.status = updates.completed ? 'completed' : 'pending';
  }

  if (updates.status !== undefined) {
    if (!['pending', 'partial', 'completed'].includes(updates.status)) {
      return res.status(400).json({ message: 'status must be pending, partial or completed' });
    }

    updates.completed = updates.status === 'completed';
  }

  Object.keys(updates).forEach((key) => {
    if (updates[key] === undefined) {
      delete updates[key];
    }
  });

  const task = await Task.findOneAndUpdate(
    { _id: req.params.taskId, owner: req.user._id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  return res.json(task);
});

router.delete('/:taskId', async (req, res) => {
  const task = await Task.findOneAndDelete({ _id: req.params.taskId, owner: req.user._id });

  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  return res.json({ message: 'Task deleted', id: task._id });
});

module.exports = router;
