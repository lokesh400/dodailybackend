const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
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
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'partial', 'completed'],
      default: 'pending',
    },
    completed: {
      type: Boolean,
      default: false,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.pre('save', function syncStatusAndCompleted() {
  if (!this.status) {
    this.status = this.completed ? 'completed' : 'pending';
  }

  this.completed = this.status === 'completed';
});

module.exports = mongoose.model('Task', taskSchema);
