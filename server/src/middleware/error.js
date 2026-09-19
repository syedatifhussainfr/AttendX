export function notFound(req, res) {
  res.status(404).json({ message: "Endpoint not found." });
}
export function errorHandler(error, req, res, next) {
  if (error.name === "ZodError")
    return res
      .status(400)
      .json({ message: "Validation failed.", errors: error.flatten() });
  if (error.name === "SequelizeUniqueConstraintError")
    return res.status(409).json({ message: "That record already exists." });
  if (
    error.name === "SequelizeTimeoutError" ||
    error.original?.code === "SQLITE_BUSY"
  ) {
    res.setHeader("Retry-After", "1");
    return res.status(503).json({
      message: "The database is briefly busy. Please retry.",
      code: "DATABASE_BUSY",
    });
  }
  if (!error.status || error.status >= 500) console.error(error);
  res.status(error.status || 500).json({
    message: error.status ? error.message : "Unexpected server error.",
    ...(error.code && { code: error.code }),
    ...(error.details && { details: error.details }),
  });
}
