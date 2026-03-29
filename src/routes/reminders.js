const express = require('express');

const isAuthenticated = require('../middleware/isAuthenticated');
const Reminder = require('../models/Reminder');

const router = express.Router();

router.use(isAuthenticated);

router.get('/', async (req, res) => {
  const reminders = await Reminder.find({ owner: req.user._id }).sort({ date: 1, time: 1, createdAt: 1 });
  return res.json(reminders);
});

router.post('/', async (req, res) => {
  const { title, date, time = '', notes = '' } = req.body;

  if (!title || !date) {
    return res.status(400).json({ message: 'title and date are required' });
  }

  const reminder = await Reminder.create({
    title,
    date,
    time,
    notes,
    owner: req.user._id,
  });

  return res.status(201).json(reminder);
});

router.patch('/:reminderId', async (req, res) => {
  const updates = {
    title: req.body.title,
    notes: req.body.notes,
    date: req.body.date,
    time: req.body.time,
    done: req.body.done,
  };

  Object.keys(updates).forEach((key) => {
    if (updates[key] === undefined) {
      delete updates[key];
    }
  });

  const reminder = await Reminder.findOneAndUpdate(
    { _id: req.params.reminderId, owner: req.user._id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!reminder) {
    return res.status(404).json({ message: 'Reminder not found' });
  }

  return res.json(reminder);
});

router.delete('/:reminderId', async (req, res) => {
  const reminder = await Reminder.findOneAndDelete({
    _id: req.params.reminderId,
    owner: req.user._id,
  });

  if (!reminder) {
    return res.status(404).json({ message: 'Reminder not found' });
  }

  return res.json({ message: 'Reminder deleted', id: reminder._id });
});

module.exports = router;
