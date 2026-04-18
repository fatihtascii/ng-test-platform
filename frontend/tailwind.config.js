/** @type {import('tailwindcss').Config} */
export default {
  // KRİTİK: Temayı manuel olarak (class ile) kontrol etmemizi sağlar
  darkMode: 'class', 
  
  // Tailwind'in hangi dosyalardaki sınıfları tarayacağını belirler
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      colors: {
        // İstersen buraya projene özel marka renkleri ekleyebilirsin
        // Örn: primary: '#4f46e5' gibi
      },
      // Sayfa geçişleri için yumuşak animasyonlar (opsiyonel)
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      }
    },
  },
  
  plugins: [],
}