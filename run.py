import os
import shutil
import subprocess

def main():
    print("==========================================")
    print("       Khoi dong ZaloCRM (Docker)         ")
    print("==========================================")

    env_file = ".env"
    env_example = ".env.example"

    # Kiểm tra và tạo file .env nếu chưa có
    if not os.path.exists(env_file):
        if os.path.exists(env_example):
            print("[INFO] Dang tao file .env tu .env.example...")
            shutil.copy(env_example, env_file)
        else:
            print("[WARNING] Khong tim thay file .env.example!")

    print("[INFO] Dang chay docker compose...")
    try:
        # Chạy lệnh docker compose
        subprocess.run(["docker", "compose", "up", "-d", "--build"], check=True)
        
        print("==========================================")
        print("ZaloCRM dang khoi dong.")
        print("Vui long truy cap: http://localhost:3080")
        print("De xem log, chay lenh: docker compose logs -f")
        print("==========================================")
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Co loi xay ra khi chay docker compose: {e}")
    except FileNotFoundError:
        print("[ERROR] Khong tim thay 'docker' tren he thong. Vui long cai dat Docker Desktop.")

if __name__ == "__main__":
    main()
