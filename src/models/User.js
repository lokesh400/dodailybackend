const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose').default;

const userSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.plugin(passportLocalMongoose, {
  usernameField: 'username',
  usernameLowerCase: true,
});

module.exports = mongoose.model('User', userSchema);
