/* Titik sambungan agen. Sengaja kosong.
   Nanti isi connect() supaya status lantai ikut sesi AI. */
export const agentLink = {
  connected: false,
  async connect() {
    return { ok: false, reason: "belum dipasang" };
  },
  async pushStatus() {
    return { ok: false, reason: "belum dipasang" };
  },
};
