// Utility to send email using Brevo (formerly Sendinblue)
const SibApiV3Sdk = require('sib-api-v3-sdk');

const apiKey = process.env.BREVO_API_KEY;
const senderEmail = process.env.BREVO_SENDER_EMAIL || 'no-reply@dodaiy.com';

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKeyInstance = defaultClient.authentications['api-key'];
apiKeyInstance.apiKey = apiKey;

const sendBrevoMail = async ({ to, subject, htmlContent }) => {
  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;
  sendSmtpEmail.sender = { email: senderEmail, name: 'DoDaily' };
  sendSmtpEmail.to = [{ email: to }];
  await apiInstance.sendTransacEmail(sendSmtpEmail);
};

module.exports = sendBrevoMail;
