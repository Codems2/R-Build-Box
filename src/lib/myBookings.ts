/** Reservas hechas desde este dispositivo (para poder mostrarlas y cancelarlas
 *  sin necesidad de cuentas de usuario). */

export interface MyBooking {
  bookingId: string;
  cancelToken: string;
  slotId: string;
  classDate: string;
  name: string;
}

const KEY = 'rmbox_my_bookings_v1';

function read(): MyBooking[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as MyBooking[];
  } catch {
    return [];
  }
}

export function getMyBooking(slotId: string, classDate: string): MyBooking | undefined {
  return read().find((b) => b.slotId === slotId && b.classDate === classDate);
}

export function rememberBooking(b: MyBooking) {
  localStorage.setItem(KEY, JSON.stringify([...read(), b]));
}

export function forgetBooking(bookingId: string) {
  localStorage.setItem(KEY, JSON.stringify(read().filter((b) => b.bookingId !== bookingId)));
}
