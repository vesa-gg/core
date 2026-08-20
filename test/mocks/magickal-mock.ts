export function provideMagickalMock<T>(
  cls: new (...args: never[]) => T,
): jest.Mocked<T> {
  const instance = Object.create(cls.prototype) as T;

  let proto = cls.prototype;
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      if (descriptor && typeof descriptor.value === "function") {
        (instance as Record<string, unknown>)[key] = jest.fn();
      }
    }
    proto = Object.getPrototypeOf(proto) as typeof proto;
  }

  return instance as jest.Mocked<T>;
}
