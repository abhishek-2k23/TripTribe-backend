export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  // errorHandler reads the status off the error, not off res — a bare res.status() here is discarded.
  error.statusCode = 404;
  next(error);
};
