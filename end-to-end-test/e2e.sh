bash download_test_data.sh
npm run compile-dev --camera=github-linux-environment
python3 transform_times.py 
bash test.sh
bash test_finish.sh