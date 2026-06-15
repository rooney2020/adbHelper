import os
import glob
import pandas as pd
import re
import shutil
from datetime import datetime
import argparse

def process_txt_files(base_dir, label_name):
    # 查找所有的txt文件
    txt_files = glob.glob(os.path.join(base_dir, "*.txt"))

    if not txt_files:
        print(f"在 {base_dir} 中没有找到 txt 文件。")
        return

    data = []

    # 归档目录
    archive_dir = os.path.join(base_dir, "Archived")
    if not os.path.exists(archive_dir):
        os.makedirs(archive_dir)

    for file_path in txt_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()

            blocks = re.findall(r'"([^"]*)"', content)

            for block in blocks:
                assistant_turns = block.count('assistant：') + block.count('assistant:')

                is_multi_turn = "多轮" if assistant_turns > 0 else "单论"

                # 去除每一行开头的空白字符，保证 user： 和 assistant： 顶格
                clean_block = "\n".join([line.lstrip() for line in block.strip().splitlines()])

                data.append({
                    "query": clean_block,
                    "old_output": label_name,
                    "轮数": is_multi_turn,
                    "output": label_name
                })

        # 处理完后将文件移动到Archived目录
        file_name = os.path.basename(file_path)
        shutil.move(file_path, os.path.join(archive_dir, file_name))

    df = pd.DataFrame(data)

    # 获取当前时间到分钟，格式如: 202605161141
    time_str = datetime.now().strftime("%Y%m%d%H%M")

    # 生成带时间戳的文件名
    output_path = os.path.join(base_dir, f"output_data_{time_str}.csv")
    df.to_csv(output_path, index=False, encoding='utf-8-sig')
    print(f"数据已保存到 {output_path}. 共计 {len(df)} 条记录。")
    print(f"已将 {len(txt_files)} 个txt文件移动到 {archive_dir} 目录。")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Process text files into a CSV dataframe.')
    parser.add_argument('--base_dir', type=str, default=r"D:\Jeff_branch\FA_Intent\人车家",
                        help='The directory containing the txt files')
    parser.add_argument('--label_name', type=str, default="人车家",
                        help='The label to put in old_output and output columns')

    args = parser.parse_args()

    process_txt_files(args.base_dir, args.label_name)
