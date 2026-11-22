let navigator = null;

export const setNavigator = (fn) => {
  navigator = fn;
};

export const navigateTo = (path, opts) => {
  if (navigator) {
    navigator(path, opts);
  } else {
    window.location.assign(path);
  }
};
