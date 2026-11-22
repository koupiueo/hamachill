export const setCookie = (name, value, days = 365) => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
  document.cookie = `${name}=${encodeURIComponent(stringValue)}; expires=${expires}; path=/`;
};

export const getCookie = (name) => {
  const value = document.cookie.split('; ').find(row => row.startsWith(`${name}=`));
  if (!value) return null;
  const decodedValue = decodeURIComponent(value.split('=')[1]);
  try {
    return JSON.parse(decodedValue);
  } catch (e) {
    return decodedValue;
  }
};
