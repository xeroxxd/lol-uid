# ---------------DECODE BY SAJU x ERROR-----------#
# <------------! MR-CODE-143 !------------> #
try:
    import os,sys,json
    import random,string
    import requests,uuid
    from concurrent.futures import ThreadPoolExecutor
except (FileNotFoundError,Exception):
    print(" Something went wrong...")
    os.system("pip install requests rich > /dev/null")
    pass

def banner():
    os.system("clear")
    print(f"""\x1b[97m
    
████████╗░█████╗░██╗░░██╗███████╗███╗░░██╗
╚══██╔══╝██╔══██╗██║░██╔╝██╔════╝████╗░██║
░░░██║░░░██║░░██║█████═╝░█████╗░░██╔██╗██║
░░░██║░░░██║░░██║██╔═██╗░██╔══╝░░██║╚████║
░░░██║░░░╚█████╔╝██║░╚██╗███████╗██║░╚███║
░░░╚═╝░░░░╚════╝░╚═╝░░╚═╝╚══════╝╚═╝░░╚══╝
\33[31;1m (•) NUMBER,PASS TO COOKIE GENERATOR
\33[32;1m (•) DEVELOPER   : TOHIN KING 
(-) TOHIN KING FUCK BY : ERROR x SAJU
\33[33;1m (•) REPO : github.com/TOHIN-143/OPEN
--------------------------------------------""")

class aiman:
    def __init__(self):
        self.ugen = "[FBAN/FB4A;FBAV/272.0.0.50.125;FBBV/216845599;FBDM/{density=3.0,width=1080,height=2175};FBLC/en_US;FBRV/217753680;FBCR/Sprint;FBMF/samsung;FBBD/samsung;FBPN/com.facebook.katana;FBDV/SM-G965U;FBSV/10;FBOP/19;FBCA/arm64-v8a:;]"
        self.sess = requests.Session()
        self.url = "https://graph.facebook.com/auth/login"
    def menu(self):
        banner()
        print(" (•) ENTER YOUR EMAIL/NUMBER")
        mail = input(" (•) EMAIL     : ")
        print(44*"-")
        print(" (•) ENTER YOUR PASSWORD")
        pas = input(" (•) PASSWORD  : ")
        print(44*"-")
        try:
            data = {
                "adid": str(uuid.uuid4()),
                "format": "json",
                "device_id": str(uuid.uuid4()),
                "cpl": "true",
                "family_device_id": str(uuid.uuid4()),
                "credentials_type": "device_based_login_password",
                "error_detail_type": "button_with_disabled",
                "source": "device_based_login",
                "email":mail,
                "password": pas,
                "access_token": "350685531728%7C62f8ce9f74b12f84c123cc23437a4a32",
                "generate_session_cookies": "1",
                "meta_inf_fbmeta": "",
                "advertiser_id": str(uuid.uuid4()),
                "currently_logged_in_userid": "0",
                "locale": "en_US",
                "client_country_code": "US",
                "method": "auth.login",
                "fb_api_req_friendly_name": "authenticate",
                "fb_api_caller_class": "com.facebook.account.login.protocol.Fb4aAuthHandler",
                "api_key": "882a8490361da98702bf97a021ddc14d",
            }
            headers = {
                'User-Agent': self.ugen,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Host': 'graph.facebook.com',
                'X-FB-Net-HNI': str(random.randint(20000, 40000)),
                'X-FB-SIM-HNI': str(random.randint(20000, 40000)),
                'X-FB-Connection-Type': 'MOBILE.LTE',
                'X-Tigon-Is-Retry': 'False',
                'x-fb-session-id': 'nid=jiZ+yNNBgbwC;pid=Main;tid=132;nc=1;fc=0;bc=0;cid=d29d67d37eca387482a8a5b740f84f62',
                'x-fb-device-group': '5120',
                'X-FB-Friendly-Name': 'ViewerReactionsMutation',
                'X-FB-Request-Analytics-Tags': 'graphservice',
                'X-FB-HTTP-Engine': 'Liger',
                'X-FB-Client-IP': 'True',
                'X-FB-Server-Cluster': 'True',
                'x-fb-connection-token': 'd29d67d37eca387482a8a5b740f84f62'
            }
            response = self.sess.post(self.url,data=data,headers=headers).json()
            if "access_token" in response:
                self.token = str(response["access_token"])
                self.cookie = ";".join(i["name"]+"="+i["value"] for i in response["session_cookies"])
                print("\t\tLOGIN SUCCESSFULL")
                print(44*"-")
                print(f" (•) TOKEN  : \x1b[92m{self.token}\x1b[97m")
                print(44*"-")
                print(f" (•) COOKIE : \x1b[92m{self.cookie}\x1b[97m")
                print(44*"-")
                sys.exit()
            elif "User must verify their account" in response:
                sys.exit(" (•) CHECKPOINT ID BRO !!")
            else:
                sys.exit(" (•) EMAIL/PASSWORD WRONG")
        except Exception as e:
            pass

if __name__ =="__main__":
    aiman().menu()
