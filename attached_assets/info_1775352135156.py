from flask import Flask, request, jsonify
import re
import json
import requests
from datetime import datetime
from urllib.parse import urlparse, unquote
import http.client
import ssl
from bs4 import BeautifulSoup

app = Flask(__name__)

ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

class FacebookInfoExtractor:
    def __init__(self):
        self.headers = {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'en-US,en;q=0.9',
            'dpr': '1.5',
            'priority': 'u=0, i',
            'sec-ch-prefers-color-scheme': 'dark',
            'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Microsoft Edge";v="146"',
            'sec-ch-ua-full-version-list': '"Chromium";v="146.0.7680.76", "Not-A.Brand";v="24.0.0.0", "Microsoft Edge";v="146.0.3856.59"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-model': '""',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua-platform-version': '"19.0.0"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0'
        }

    # Added function to format input into a valid Facebook URL
    def format_target_url(self, target):
        target = str(target).strip()
        if target.startswith('http://') or target.startswith('https://'):
            return target
        elif 'facebook.com' in target:
            return f"https://{target}"
        elif target.isdigit():
            return f"https://www.facebook.com/profile.php?id={target}"
        else:
            return f"https://www.facebook.com/{target}"

    def resolve_facebook_url(self,url):
        try:
        	r = requests.get(url, allow_redirects=True, timeout=10)
        	return r.url
        except:
        	return url

    def fetch_url(self, url):
        try:
            parsed = urlparse(url)
            host = parsed.netloc
            path = parsed.path or '/'
            if parsed.query:
                path += '?' + parsed.query
            
            conn = http.client.HTTPSConnection(host, context=ssl_context, timeout=15)
            conn.request('GET', path, headers=self.headers)
            response = conn.getresponse()
            
            if response.status == 200:
                data = response.read()
                conn.close()
                return data.decode('utf-8', errors='ignore')
            conn.close()
            return None
        except Exception:
            return None
    
    def extract_profile_info(self, url):
        try:
            # Format the URL first
            url = self.format_target_url(url)
            url = self.resolve_facebook_url(url)
            html_content = self.fetch_url(url)
            
            if not html_content:
                return {
                    "status": "error",
                    "message": "Could not fetch profile page"
                }
            
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # ========================
            # NAME EXTRACTION
            # ========================
            name = "Not found"
            name_tag = soup.find('meta', property='og:title')
            if name_tag and name_tag.get('content'):
                name = name_tag['content']
            
            # ========================
            # USERNAME & ID EXTRACTION
            # ========================
            username = "Not found"
            userid = "Not found"
            
            id_match = re.search(r'profile\.php\?id=(\d+)', url)
            if id_match:
                userid = id_match.group(1)
                username = userid
            else:
                url_tag = soup.find('meta', property='og:url')
                if url_tag and url_tag.get('content'):
                	url_match = re.search(r'facebook\.com/([^/?]+)', url_tag['content'])
                	if url_match:
                	    username = url_match.group(1)
            
            android_tag = soup.find('meta', property='al:android:url')
            if android_tag and android_tag.get('content'):
                id_match = re.search(r'profile/(\d+)', android_tag['content'])
                if id_match:
                    userid = id_match.group(1)
            
            # ========================
            # PROFILE PICTURE EXTRACTION
            # ========================
            profile_pic = "Not found"
            pic_tag = soup.find('meta', property='og:image')
            if pic_tag and pic_tag.get('content'):
                profile_pic = pic_tag['content']
            
            # ========================
            # COVER PHOTO EXTRACTION
            # ========================
            cover_photo = "Not found"
            cover_match = re.search(r'"cover_photo"[^}]*"uri":"([^"]+)"', html_content)
            if cover_match:
                cover_photo = cover_match.group(1).replace('\\', '')
            
            # ========================
            # GENDER EXTRACTION
            # ========================
            gender = "Not found"
            gender_match = re.search(r'"gender":"([^"]+)"', html_content, re.IGNORECASE)
            if gender_match:
                gender_text = gender_match.group(1)
                gender = "Male" if gender_text.lower() == "male" else "Female" if gender_text.lower() == "female" else gender_text
            
            # ========================
            # FOLLOWER/LIKES COUNT EXTRACTION
            # ========================
            follower_count = "Not found"
            
            meta_desc = soup.find('meta', property='og:description')
            if meta_desc and meta_desc.get('content'):
                desc_content = meta_desc['content']
                match = re.search(r'([\d,]+)\s+(?:likes|followers)', desc_content, re.IGNORECASE)
                if match:
                    follower_count = match.group(1).replace(',', '')
            
            if follower_count == "Not found":
                match_likes = re.search(r'([\d,]+)\s+likes', html_content, re.IGNORECASE)
                match_followers = re.search(r'([\d,]+)\s+followers', html_content, re.IGNORECASE)
                
                if match_likes:
                    follower_count = match_likes.group(1).replace(',', '')
                elif match_followers:
                    follower_count = match_followers.group(1).replace(',', '')
            
            if follower_count == "Not found":
                count_elem = soup.find(['span', 'div'], string=re.compile(r'[\d,]+ (?:likes|followers)', re.IGNORECASE))
                if count_elem:
                    count_match = re.search(r'([\d,]+)', count_elem.text)
                    if count_match:
                        follower_count = count_match.group(1).replace(',', '')
            
            return {
                "name": name,
                "username": username,
                "user_id": userid,
                "gender": gender,
                "profile_pic": profile_pic,
                "cover_photo": cover_photo,
                "follower_count": follower_count,
                "status": "success"
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"Extraction failed: {str(e)}"
            }
            
    # ... (rest of your methods like parse_cookies, fetch_apps_page, extract_apps remain exactly the same)
    # Keeping them hidden here to save space, but they must be in your file as they were in [source: 2]

extractor = FacebookInfoExtractor()

@app.route('/profile', methods=['GET', 'POST'])
def get_profile():
    if request.method == 'POST':
        data = request.get_json()
        target = data.get('url') if data else None
    else:
        target = request.args.get('url')
    
    if not target:
        return jsonify({
            "status": "error",
            "message": "Please provide a Facebook URL, Username, or UID"
        }), 400
    
    # URL check removed because we are formatting it inside the class anyway
    
    result = extractor.extract_profile_info(target)
    
    if result.get('status') == 'error':
        return jsonify(result), 400
    
    return jsonify({
        "success": True,
        "data": result,
        "timestamp": datetime.now().isoformat()
    })

# ... (rest of your routes like /apps, /batch/profile remain the same)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=True)