export function validateHistory(files, applied, requireCurrent = false) {
  if (requireCurrent && files.length !== applied.length)
    throw new Error(
      "Reference import requires the current schema and migration history",
    );
  for (let index = 0; index < applied.length; index++) {
    if (
      files[index]?.name !== applied[index].name ||
      files[index]?.checksum !== applied[index].checksum
    ) {
      throw new Error(
        "Migration history differs from this release; restore applied files and add a new migration.",
      );
    }
  }
}
