const User = require("../models/user");
const jwt = require("jsonwebtoken");
const { expressjwt } = require("express-jwt");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");
const _ = require("lodash");

const myOAuth2Client = new OAuth2Client(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET
);

myOAuth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});
const myEmail = "khanhkhung0303@gmail.com";
const sendEmail = async (emailData) => {
  try {
    const accessTokenObject = await myOAuth2Client.getAccessToken();
    const accessToken = accessTokenObject?.token;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: myEmail,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refresh_token: process.env.REFRESH_TOKEN,
        accessToken: accessToken,
      },
    });

    const mailOptions = {
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.content,
    };

    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully.");
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

exports.signup = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email }).exec();

    if (existingUser) {
      return res.status(400).json({ error: "Email is taken" });
    }

    const token = jwt.sign(
      { name, email, password },
      process.env.JWT_ACCOUNT_ACTIVATION,
      { expiresIn: "2m" }
    );
    const emailData = {
      to: email,
      subject: "Notification! Comfirm your account.",
      content: `<h3>Hello ${name}, please follow the link...</h3>
        <p>${process.env.CLIENT_URL}/auth/activate/${token}</p>`,
    };

    await sendEmail(emailData);

    return res.status(200).json({
      message: `Email has been sent to ${email}. Follow the instruction to active your acccount`,
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ errors: error.message });
  }
};

exports.accountActivation = (req, res) => {
  const { token } = req.body;
  if (token) {
    jwt.verify(
      token,
      process.env.JWT_ACCOUNT_ACTIVATION,
      function (err, decoded) {
        if (err) {
          console.log("JWT verify in account activation error: ", err);
          return res.status(401).json({
            error: "Expired link. Signup Again",
          });
        }
        const { name, email, password } = decoded;

        const user = new User({ name, email, password });

        user
          .save()
          .then((user) => {
            return res.status(200).json({
              message: "Signup success. Please signin",
            });
          })
          .catch((err) => {
            if (err) {
              console.log("Save user in account activation error: ", err);
              return res.status(401).json({
                error: "Error saving user from database. Try signup again!",
              });
            }
          });
      }
    );
  } else {
    return res.status(403).json({
      message: "Something went wrong. Try again",
    });
  }
};

exports.signin = (req, res) => {
  const { email, password } = req.body;

  User.findOne({ email })
    .exec()
    .then((user) => {
      if (!user) {
        return res.status(400).json({
          error: "User with that email does not exist. Please sign up",
        });
      }
      if (!user.authenticate(password)) {
        return res.status(400).json({
          error: "Email and password do not match",
        });
      }
      const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "1m",
      });
      const { _id, name, email, role } = user;

      return res.status(200).json({
        token,
        user: { _id, name, email, role },
      });
    })
    .catch((err) => {
      console.log(err);
      return res.status(400).json({
        error: err,
      });
    });
};

exports.requireSignin = expressjwt({
  secret: process.env.JWT_SECRET,
  algorithms: ["HS256"],
});

exports.adminMiddleware = (req, res, next) => {
  User.findById({ _id: req.auth._id })
    .exec()
    .then((user) => {
      if (!user) {
        return res.status(400).json({
          error: "User not found",
        });
      }
      if (user.role !== "admin") {
        return res.status(400).json({
          error: "Admin resource. Access denied",
        });
      }
      req.profile = user;
      next();
    })
    .catch((err) => console.log(err));
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Kiểm tra người dùng tồn tại
    const user = await User.findOne({ email }).exec();
    if (!user) {
      return res.status(400).json({
        error: "User with that email does not exist. Please sign up",
      });
    }

    // Tạo và lưu token vào db
    const token = jwt.sign({ _id: user._id }, process.env.JWT_RESET_PASSWORD, {
      expiresIn: "3m",
    });

    const resetPasswordLink = await User.updateOne({
      resetPasswordLink: token,
    }).exec();
    if (!resetPasswordLink) {
      console.log("resetPasswordLink: ", resetPasswordLink);
      return res.status(400).json({
        error: "Database connection error on user password forgot request",
      });
    }

    // Gửi email
    const { name, email: userEmail } = user;
    const emailData = {
      to: userEmail,
      subject: "Notification! Reset your password.",
      content: `<h3>Hello ${name}, please follow the link...</h3>
        <p>${process.env.CLIENT_URL}/auth/password/reset/${token}</p>`,
    };

    // Gửi email và trả về thông báo
    sendEmail(emailData);
    return res.status(200).json({
      message: `Email has been sent to ${userEmail}. Follow the instruction to active your account`,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(400).json({
      error: error.message || "Something went wrong",
    });
  }
};

exports.resetPassword = (req, res) => {
  const { resetPasswordLink, newPassword } = req.body;

  if (resetPasswordLink) {
    jwt.verify(
      resetPasswordLink,
      process.env.JWT_RESET_PASSWORD,
      function (err, decoded) {
        if (err) {
          return res.status(400).json({
            error: "Expired link. Try again",
          });
        }
        User.findOne({ resetPasswordLink })
          .exec()
          .then((user) => {
            console.log("user: ", user);

            if (!user) {
              return res.status(400).json({
                error: "Something went wrong. Try later",
              });
            }
            const updatedFields = {
              password: newPassword,
              resetPasswordLink: "",
            };
            user = _.extend(user, updatedFields);
            user
              .save()
              .then((response) => {
                console.log("response: ", response);
                return res.status(200).json({
                  error: "Awesome ! Now you can login with your new password",
                });
              })
              .catch((err) => {
                console.log("err save: ", err);
              });
          })
          .catch((err) => {
            console.log("err: ", err);
          });
      }
    );
  }
};
