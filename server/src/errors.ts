export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Introuvable') {
    super(message, 404, 'not_found');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'conflict');
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400, 'bad_request');
  }
}
