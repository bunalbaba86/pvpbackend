// Basit istemci tarafı kimlik doğrulama işlemleri

// Kullanıcı kaydı fonksiyonu
function registerUser(username, password) {
  const userData = {
    username: username,
    password: password
  };
  
  // localStorage'da saklayalım (gerçek uygulamada server'a gönderilir)
  localStorage.setItem('user', JSON.stringify(userData));
  return true;
}

// Kullanıcı girişi fonksiyonu
function loginUser(username, password) {
  // Gerçek uygulamada server'a gönderilir ve doğrulanır
  // Burada sadece bilgileri saklıyoruz
  const userData = {
    username: username,
    password: password // Gerçek uygulamada şifre saklanmaz
  };
  
  localStorage.setItem('user', JSON.stringify(userData));
  return true;
}

// Kullanıcı çıkışı
function logoutUser() {
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}

// Kullanıcı giriş yapmış mı kontrol et
function isLoggedIn() {
  return localStorage.getItem('user') !== null;
}

// Aktif kullanıcı bilgilerini getir
function getCurrentUser() {
  const userData = localStorage.getItem('user');
  return userData ? JSON.parse(userData) : null;
}
