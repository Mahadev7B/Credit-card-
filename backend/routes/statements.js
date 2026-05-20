const router = require('express').Router();
const Joi = require('joi');
const { authenticate } = require('../middleware/auth');
const statementGenerator = require('../services/statementGenerator');

const querySchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  cardId: Joi.string(),
  format: Joi.string().valid('pdf', 'csv').default('pdf'),
});

router.use(authenticate);

router.get('/download', async (req, res, next) => {
  try {
    const { error, value } = querySchema.validate(req.query);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { startDate, endDate, cardId, format } = value;

    if (format === 'pdf') {
      const pdfBuffer = await statementGenerator.generatePDF({
        userId: req.user._id,
        user: req.user,
        startDate,
        endDate,
        cardId,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="statement-${startDate.toISOString().slice(0, 10)}.pdf"`
      );
      res.send(pdfBuffer);
    } else {
      const csvData = await statementGenerator.generateCSV({
        userId: req.user._id,
        startDate,
        endDate,
        cardId,
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="statement-${startDate.toISOString().slice(0, 10)}.csv"`
      );
      res.send(csvData);
    }
  } catch (err) {
    next(err);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    const { error, value } = querySchema.omit(['format']).validate(req.query);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const summary = await statementGenerator.getSummary({
      userId: req.user._id,
      startDate: value.startDate,
      endDate: value.endDate,
      cardId: value.cardId,
    });

    res.json({ summary });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
