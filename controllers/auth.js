const User = require("../models/user");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const nodemailer = require("nodemailer");

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
      message: "Signup success! Please sign in",
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
        expiresIn: "5m",
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
