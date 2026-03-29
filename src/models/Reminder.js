const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      default: '',
      trim: true,
    },
    done: {
      type: Boolean,
      default: false,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Reminder', reminderSchema);
