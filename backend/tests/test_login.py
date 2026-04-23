import pytest
from playwright.sync_api import Page, expect

def test_ng_platform_title(page: Page):
    print("\n[LOG] Tarayıcı başlatılıyor ve Wikipedia'ya gidiliyor...")
    page.goto("https://tr.wikipedia.org/")
    
    print("[LOG] Sayfa başlığı kontrol ediliyor...")
    expect(page).to_have_title("Vikipedi: Özgür Ansiklopedi")
    print("[LOG] Başlık doğrulandı: Başarılı!")

def test_search_functionality(page: Page):
    print("\n[LOG] Wikipedia arama motoru açılıyor...")
    page.goto("https://tr.wikipedia.org/")
    
    print("[LOG] Arama kutusuna metin giriliyor...")
    search_box = page.locator("[name='search']").first
    search_box.fill("Yazılım testi")
    
    print("[LOG] Klavyeden Enter tuşuna basılıyor...")
    search_box.press("Enter")
    
    page.wait_for_selector("#firstHeading")
    print("[LOG] Arama sonuçları başarıyla listelendi!")
    assert True