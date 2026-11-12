import { Client } from "pg";

export function neon(connectionString) {
  return async (parts, ...values) => {
    const sql = parts.reduce(
      (text, part, i) => text + (i ? `$${i}` : "") + part,
      "",
    );
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      return (await client.query(sql, values)).rows;
    } finally {
      await client.end();
    }
  };
}

const images = new Map();
export class PutObjectCommand {
  constructor(input) {
    this.input = input;
  }
}
export class GetObjectCommand {
  constructor(input) {
    this.input = input;
  }
}
export class DeleteObjectCommand {
  constructor(input) {
    this.input = input;
  }
}
export class HeadObjectCommand {
  constructor(input) {
    this.input = input;
  }
}
export class S3Client {
  async send(command) {
    const key = `${command.input.Bucket}/${command.input.Key}`;
    if (command instanceof PutObjectCommand)
      images.set(key, command.input.Body);
    else if (command instanceof DeleteObjectCommand) images.delete(key);
    else if (!images.has(key)) {
      const error = new Error("Missing fixture object");
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    } else if (command instanceof GetObjectCommand)
      return { Body: { transformToByteArray: async () => images.get(key) } };
    return {};
  }
}
