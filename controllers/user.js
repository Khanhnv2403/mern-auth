const User = require("../models/user");

exports.read = async (req, res) => {
  const userId = req.params.id;
  //   await User.findOne({ _id: userId })
  await User.findById(userId)
    .exec()
    .then((user) => {
      if (!user) {
        return res.status(400).json({
          error: "User not found",
        });
      } else {
        user.hashed_password = undefined;
        user.salt = undefined;
        user.resetPasswordLink = undefined;
        return res.status(200).json({
          usersInfo: user,
        });
      }
    })
    .catch((err) => {
      console.log("err: ", err);
    });
};

exports.update = (req, res) => {
  const { name, password } = req.body;
  User.findOne({ _id: req.auth._id })
    .exec()
    .then((user) => {
      if (!user) {
        return res.status(400).json({
          error: "User not found",
        });
      } else {
        user
          .save()
          .then((updateUser) => {
            updateUser.hashed_password = undefined;
            updateUser.salt = undefined;
            return res.status(200).json({
              user: updateUser,
            });
          })
          .catch((err) => {
            console.log(err);
            return res.status(400).json({
              error: "Update user failed",
            });
          });
      }
      if (!name) {
        return res.status(400).json({
          error: "Name is required",
        });
      } else {
        user.name = name;
      }
      if (password) {
        if (password.length < 6) {
          return res.status(400).json({
            error: "Password must be min 6 charactes long ",
          });
        } else {
          user.password = password;
        }
      }
    })
    .catch((err) => console.log(err));
};
