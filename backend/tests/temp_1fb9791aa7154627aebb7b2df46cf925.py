import pytest
from playwright.sync_api import Page, expect

def test_saucedemo_login_and_cart(page: Page):
    print("\n[LOG] Test başlatılıyor: SauceDemo (E-ticaret Demo Sitesi)")
    
    # 1. Test sitesine git
    page.goto("https://www.saucedemo.com/")
    print("[LOG] Siteye başarıyla ulaşıldı.")
    
    # 2. Login işlemi
    print("[LOG] Kullanıcı bilgileri giriliyor...")
    page.locator("[data-test='username']").fill("standard_user")
    page.locator("[data-test='password']").fill("secret_sauce")
    page.locator("[data-test='login-button']").click()
    
    # 3. Başarılı girişi doğrula
    expect(page).to_have_url("https://www.saucedemo.com/inventory.html")
    expect(page.locator(".title")).to_have_text("Products")
    print("[LOG] Giriş başarılı, ürünler listelendi.")
    
    # 4. İlk ürünü sepete ekle
    print("[LOG] 'Sauce Labs Backpack' sepete ekleniyor...")
    page.locator("[data-test='add-to-cart-sauce-labs-backpack']").click()
    
    # 5. Sepet sayacının '1' olduğunu doğrula
    cart_badge = page.locator(".shopping_cart_badge")
    expect(cart_badge).to_have_text("1")
    print("[LOG] Ürün başarıyla sepete eklendi ve sayaç doğrulandı.")
    
    print("[LOG] Kurumsal test senaryosu kusursuz tamamlandı! ✅")
    
    # İŞTE ZAMANI DURDURAN KOMUT (Diğerleriyle aynı hizada, fonksiyonun İÇİNDE)
    page.pause()