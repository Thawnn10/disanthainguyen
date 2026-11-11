/**
 * NGÂN HÀNG CÂU HỎI TRÒ CHƠI TƯƠNG TÁC:
 * "SẮC MÀU DI SẢN THÁI NGUYÊN – KHÁM PHÁ VĂN HÓA, CHINH PHỤC TRI THỨC"
 * Nguồn dữ liệu: Tài liệu Chủ đề 2 - Di sản văn hóa phi vật thể tỉnh Thái Nguyên (okok.docx)
 */
(function (window) {
  'use strict';

  const HERITAGE_QUIZ_DATA = {
    meta: {
      title: 'SẮC MÀU DI SẢN THÁI NGUYÊN',
      subtitle: 'Khám phá kho tàng văn hóa – Chinh phục những giá trị di sản quê hương.',
      welcomeTitle: 'CHÀO MỪNG ĐẾN VỚI SẮC MÀU DI SẢN THÁI NGUYÊN',
      pointsPerCorrect: 100
    },

    decks: {
      knowledge: {
        id: 'knowledge',
        badge: 'THẺ 1 – DI SẢN VĂN HÓA XỨ CHÀM XỨ TRÀ',
        title: 'KIẾN THỨC DI SẢN',
        icon: 'fa-solid fa-brain',
        description: 'Kiểm tra kiến thức về lịch sử, đặc điểm và các loại hình di sản văn hóa phi vật thể tỉnh Thái Nguyên.',
        questionCountLabel: '25 câu hỏi',
        formatLabel: 'Trắc nghiệm 4 đáp án',
        difficultyLabel: 'Cơ bản – Nâng cao',
        questions: [
          {
            id: 1,
            layout: 'stacked',
            question: 'Nội dung nào sau đây phản ánh đúng khái niệm “Di sản văn hóa phi vật thể”?',
            options: [
              { id: 'A', text: 'Di tích lịch sử - văn hoá tiêu biểu, danh lam thắng cảnh.' },
              { id: 'B', text: 'Sản phẩm tinh thần gắn với cộng đồng hoặc cá nhân.' },
              { id: 'C', text: 'Di vật, cổ vật tiêu biểu được xếp hạng bảo vật quốc gia.' },
              { id: 'D', text: 'Sản phẩm vật chất được kế thừa của quốc gia, dân tộc.' }
            ],
            correctAnswer: 'B'
          },
          {
            id: 2,
            question: 'Di sản văn hóa phi vật thể được lưu truyền qua các thế hệ chủ yếu bằng các hình thức nào sau đây?',
            options: [
              { id: 'A', text: 'Truyền miệng, truyền nghề, trình diễn.' },
              { id: 'B', text: 'Giao lưu kinh tế, vận động xã hội.' },
              { id: 'C', text: 'Múa hát, đóng phim, kể chuyện lịch sử.' },
              { id: 'D', text: 'Tổ chức hội nghị, tuyên truyền chính trị.' }
            ],
            correctAnswer: 'A'
          },
          {
            id: 3,
            question: 'Nội dung nào sau đây là điểm giống nhau giữa di sản văn hoá phi vật thể và di sản văn hoá vật thể?',
            options: [
              { id: 'A', text: 'Gắn với cộng đồng hoặc cá nhân, vật thể và không gian văn hóa liên quan.' },
              { id: 'B', text: 'Có giá trị lịch sử, văn hóa, khoa học, được lưu truyền qua các thế hệ khác nhau.' },
              { id: 'C', text: 'Thể hiện bản sắc của cộng đồng hoặc nhóm người trên một không gian văn hóa.' },
              { id: 'D', text: 'Bao gồm di tích lịch sử - văn hóa, danh lam thắng cảnh, di vật, cổ vật, bảo vật.' }
            ],
            correctAnswer: 'B'
          },
          {
            id: 4,
            question: 'Di sản văn hóa phi vật thể nào sau đây ở Việt Nam cần được bảo vệ khẩn cấp?',
            options: [
              { id: 'A', text: 'Dân ca quan họ Bắc Ninh.' },
              { id: 'B', text: 'Nhã nhạc cung đình Huế.' },
              { id: 'C', text: 'Nghệ thuật làm gốm của người Chăm.' },
              { id: 'D', text: 'Thực hành Then của người Tày, Nùng.' }
            ],
            correctAnswer: 'C'
          },
          {
            id: 5,
            question: 'Di sản văn hóa phi vật thể nào sau đây ở Việt Nam cần được bảo vệ khẩn cấp?',
            options: [
              { id: 'A', text: 'Hát Xoan ở Phú Thọ.' },
              { id: 'B', text: 'Đờn ca tài tử Nam Bộ.' },
              { id: 'C', text: 'Tín ngưỡng thờ cúng Hùng Vương.' },
              { id: 'D', text: 'Hội Gióng ở đền Phù Đổng và đền Sóc.' }
            ],
            correctAnswer: 'A'
          },
          {
            id: 6,
            question: 'Nghi lễ Hét khoăn của người Nùng ở Đồng Hỷ -tỉnh Thái Nguyên thuộc loại hình di sản văn hóa phi vật thể nào sau đây?',
            options: [
              { id: 'A', text: 'Tiếng nói, chữ viết.' },
              { id: 'B', text: 'Ngữ văn dân gian.' },
              { id: 'C', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'D', text: 'Tập quán xã hội và tín ngưỡng.' }
            ],
            correctAnswer: 'D'
          },
          {
            id: 7,
            question: 'Múa Tắc Xình của người Sán Chay ở Xã Phú Lương, Xã Yên Trạch, Xã Hợp Thành, xã Yên Trạch Tỉnh Thái Nguyên là di sản văn hóa phi vật thể quốc gia thuộc loại hình nào sau đây?',
            options: [
              { id: 'A', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'B', text: 'Tập quán xã hội và tín ngưỡng.' },
              { id: 'C', text: 'Lễ hội truyền thống.' },
              { id: 'D', text: 'Tri thức dân gian.' }
            ],
            correctAnswer: 'A'
          },
          {
            id: 8,
            question: 'Lễ hội đình Phương Độ trên địa bàn Phú Bình - tỉnh Thái Nguyên là di sản văn hóa phi vật thể quốc gia thuộc loại hình',
            options: [
              { id: 'A', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'B', text: 'Tập quán xã hội và tín ngưỡng.' },
              { id: 'C', text: 'Lễ hội truyền thống.' },
              { id: 'D', text: 'Tri thức dân gian.' }
            ],
            correctAnswer: 'C'
          },
          {
            id: 9,
            question: 'Chữ Nôm của người Dao tỉnh Thái Nguyên là di sản văn hóa phi vật thể quốc gia thuộc loại hình nào sau đây?',
            options: [
              { id: 'A', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'B', text: 'Tập quán xã hội và tín ngưỡng.' },
              { id: 'C', text: 'Lễ hội truyền thống.' },
              { id: 'D', text: 'Tiếng nói, chữ viết.' }
            ],
            correctAnswer: 'D'
          },
          {
            id: 10,
            question: 'Nghi lễ Cấp sắc của người Dao tỉnh Thái Nguyên là di sản văn hóa phi vật thể quốc gia thuộc loại hình nào sau đây?',
            options: [
              { id: 'A', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'B', text: 'Tập quán xã hội và tín ngưỡng.' },
              { id: 'C', text: 'Lễ hội truyền thống.' },
              { id: 'D', text: 'Tri thức dân gian.' }
            ],
            correctAnswer: 'B'
          },
          {
            id: 11,
            question: 'Nghệ thuật may thêu trang phục của người Dao Xã Trại Cau, Tràng Xá, Nghinh Tường Tỉnh Thái Nguyên là di sản văn hóa phi vật thể quốc gia thuộc loại hình nào sau đây?',
            options: [
              { id: 'A', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'B', text: 'Tập quán xã hội và tín ngưỡng.' },
              { id: 'C', text: 'Tri thức dân gian.' },
              { id: 'D', text: 'Lễ hội truyền thống.' }
            ],
            correctAnswer: 'C'
          },
          {
            id: 12,
            question: 'Lượn Cọi của người Tày ở xã: Định Hóa, Bình Yên, Trung Hội, Phượng Tiến, Phú Đình, Bình Thành, Kim Phượng, Lam Vỹ Tỉnh Thái Nguyên thuộc loại hình di sản văn hóa phi vật thể nào sau đây?',
            options: [
              { id: 'A', text: 'Tiếng nói, chữ viết.' },
              { id: 'B', text: 'Ngữ văn dân gian.' },
              { id: 'C', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'D', text: 'Tập quán xã hội và tín ngưỡng.' }
            ],
            correctAnswer: 'C'
          },
          {
            id: 13,
            question: 'Lễ hội Đền Đuổm ở xã Xã Phú Lương Tỉnh Thái Nguyên thuộc loại hình di sản văn hóa phi vật thể nào sau đây?',
            options: [
              { id: 'A', text: 'Tiếng nói, chữ viết.' },
              { id: 'B', text: 'Lễ hội truyền thống.' },
              { id: 'C', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'D', text: 'Tập quán xã hội và tín ngưỡng.' }
            ],
            correctAnswer: 'B'
          },
          {
            id: 14,
            question: 'Gia phả dòng họ Lưu Nhân Chú ở Đại Từ Tỉnh Thái Nguyên thuộc loại hình di sản văn hóa phi vật thể nào sau đây?',
            options: [
              { id: 'A', text: 'Tiếng nói, chữ viết.' },
              { id: 'B', text: 'Lễ hội truyền thống.' },
              { id: 'C', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'D', text: 'Tập quán xã hội và tín ngưỡng.' }
            ],
            correctAnswer: 'A'
          },
          {
            id: 15,
            question: 'Nghệ thuật Khèn của người Mông ở Xã Đồng Hỷ, Quang Sơn, Trại Cau, Nam Hòa, Văn Hán, Văn Lăng, Phú Lương, Yên Trạch, Hợp Thành, Yên Trạch -Tỉnh Thái Nguyên thuộc loại hình di sản văn hóa phi vật thể nào sau đây?',
            options: [
              { id: 'A', text: 'Tiếng nói, chữ viết.' },
              { id: 'B', text: 'Lễ hội dân gian.' },
              { id: 'C', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'D', text: 'Tập quán xã hội và tín ngưỡng.' }
            ],
            correctAnswer: 'C'
          },
          {
            id: 16,
            question: 'Ở Thái Nguyên, di sản văn hóa phi vật thể quốc gia nào sau đây thuộc loại hình tập quán xã hội và tín ngưỡng?',
            options: [
              { id: 'A', text: 'Nghi lễ Then người Tày ở Định Hóa.' },
              { id: 'B', text: 'Nghệ thuật Khèn của người Mông ở Sông Công.' },
              { id: 'C', text: 'Lễ hội Cầu mùa của người Sán Chay ở Phú Lương.' },
              { id: 'D', text: 'Tri thức may, thêu của người Dao ở Phổ Yên.' }
            ],
            correctAnswer: 'A'
          },
          {
            id: 17,
            question: 'Ở Thái Nguyên, di sản văn hóa phi vật thể quốc gia nào sau đây thuộc loại hình nghệ thuật trình diễn dân gian?',
            options: [
              { id: 'A', text: 'Nghi lễ Then của người Tày ở Định Hóa.' },
              { id: 'B', text: 'Nghệ thuật Khèn của người Mông ở Phú Lương và Đồng Hỷ.' },
              { id: 'C', text: 'Lễ hội đình Phương Độ ở Phú Bình.' },
              { id: 'D', text: 'Tri thức may, thêu của người Dao tỉnh Thái Nguyên.' }
            ],
            correctAnswer: 'B'
          },
          {
            id: 18,
            question: 'Ở Thái Nguyên, di sản nào sau đây thuộc các xã xã Phúc Chu - Định Hóa xã Yên Ninh - Phú Lương, tỉnh Thái Nguyên được đưa vào danh mục di sản văn hóa phi vật thể quốc gia năm 2018?',
            options: [
              { id: 'A', text: 'Hát ví của người Tày.' },
              { id: 'B', text: 'Lễ hội đình Phương Độ.' },
              { id: 'C', text: 'Lượn Cọi của người Tày.' },
              { id: 'D', text: 'Pả Dung của người Dao.' }
            ],
            correctAnswer: 'D'
          },
          {
            id: 19,
            question: 'Năm 2014, Múa Tắc Xình của người Sán Chay thuộc địa bàn nào của tỉnh Thái Nguyên được đưa vào danh mục di sản văn hóa phi vật thể quốc gia?',
            options: [
              { id: 'A', text: 'Đồng Hỷ.' },
              { id: 'B', text: 'Định Hóa.' },
              { id: 'C', text: 'Phú Lương.' },
              { id: 'D', text: 'Phú Bình.' }
            ],
            correctAnswer: 'C'
          },
          {
            id: 20,
            question: 'Năm 2015, di sản nào sau đây ở các xã xã Định Hóa, xã Bình Yên Thái Nguyên được đưa vào danh mục di sản văn hóa phi vật thể quốc gia?',
            options: [
              { id: 'A', text: 'Lễ hội Lồng Tồng của người Tày.' },
              { id: 'B', text: 'Hát Sọong cô của người Sán Dìu.' },
              { id: 'C', text: 'Lễ hội Cẩu mùa của người Sán Chay.' },
              { id: 'D', text: 'Rối cạn của người Tày ở Thẩm Rộc và Ru nghệ.' }
            ],
            correctAnswer: 'D'
          },
          {
            id: 21,
            question: 'Năm 2015, Hát Sọong cô của người Sán Dìu trên địa bàn nào sau đây ở tỉnh Thái Nguyên được đưa vào danh mục di sản văn hóa phi vật thể quốc gia?',
            options: [
              { id: 'A', text: 'Phổ Yên.' },
              { id: 'B', text: 'Phú Bình.' },
              { id: 'C', text: 'Đại Từ.' },
              { id: 'D', text: 'Đồng Hỷ.' }
            ],
            correctAnswer: 'D'
          },
          {
            id: 22,
            question: 'Năm 2016, Hát Sấng cọ của người Sán Chay trên địa bàn nào sau đây ở tỉnh Thái Nguyên được đưa vào danh mục di sản văn hóa phi vật thể quốc gia?',
            options: [
              { id: 'A', text: 'Định Hóa.' },
              { id: 'B', text: 'Phú Lương.' },
              { id: 'C', text: 'Đại Từ.' },
              { id: 'D', text: 'Đồng Hỷ.' }
            ],
            correctAnswer: 'B'
          },
          {
            id: 23,
            question: 'Năm 2017, Lễ hội Lồng Tồng của người Tày thuộc địa bàn nào sau đây ở tỉnh Thái Nguyên được đưa vào danh mục di sản văn hóa phi vật thể quốc gia?',
            options: [
              { id: 'A', text: 'Định Hóa.' },
              { id: 'B', text: 'Phú Lương.' },
              { id: 'C', text: 'Đại Từ.' },
              { id: 'D', text: 'Đồng Hỷ.' }
            ],
            correctAnswer: 'A'
          },
          {
            id: 24,
            question: 'Năm 2018, di sản nào sau đây ở các Xã Vô Tranh, Yên Trạch, Phú Lương -Tỉnh Thái Nguyên được đưa vào danh mục di sản văn hóa phi vật thể quốc gia?',
            options: [
              { id: 'A', text: 'Lễ hội Lồng Tồng của người Tày.' },
              { id: 'B', text: 'Hát Sọong cô của người Sán Dìu.' },
              { id: 'C', text: 'Lễ hội Cầu mùa của người Sán Chay.' },
              { id: 'D', text: 'Nghệ thuật khèn của người Mông.' }
            ],
            correctAnswer: 'C'
          },
          {
            id: 25,
            question: 'Tri thức trồng và chế biến chè Tân Cương thuộc địa bàn nào của tỉnh Thái Nguyên được đưa vào danh mục di sản văn hóa phi vật thể quốc gia năm 2023?',
            options: [
              { id: 'A', text: 'Các Xã Tân Cương, Xã Đại Phúc Tỉnh Thái Nguyên' },
              { id: 'B', text: 'Các xã phía nam huyện Đại Từ và các xã phía Tây thành phố Phổ Yên.' },
              { id: 'C', text: 'Phân bố rộng khắp trên địa bàn các xã phía bắc tỉnh Thái Nguyên.' },
              { id: 'D', text: 'Phân bố trên địa bàn khắp các xã thuộc thành phố Thái Nguyên.' }
            ],
            correctAnswer: 'A'
          }
        ]
      },

      image: {
        id: 'image',
        badge: 'THẺ 2 – MẮT THẦN DI SẢN',
        title: 'NHẬN DIỆN QUA HÌNH ẢNH',
        icon: 'fa-solid fa-eye',
        description: 'Quan sát hình ảnh và khám phá những di sản văn hóa đặc sắc của các dân tộc tỉnh Thái Nguyên.',
        questionCountLabel: '10 câu hỏi',
        formatLabel: 'Nhận diện hình ảnh và chọn đáp án',
        difficultyLabel: 'Nhận biết – Thông hiểu',
        questions: [
          {
            id: 1,
            question: 'Hình ảnh sau đây thuộc loại hình di sản văn hóa phi vật thể nào?',
            image: 'cauhoi/chu-nom-dao.png',
            imageAlt: 'Một trang của cuốn sách chữ Nôm Dao được lưu giữ tại gia đình ông Triệu Văn Thuận, xã Hợp Tiến, huyện Đồng Hỷ',
            caption: 'Một trang của cuốn sách chữ Nôm Dao được lưu giữ tại gia đình ông Triệu Văn Thuận, xã Hợp Tiến, huyện Đồng Hỷ (Nguồn: Sở Văn hóa, Thể Thao và Du lịch Thái Nguyên)',
            options: [
              { id: 'A', text: 'Tiếng nói, chữ viết.' },
              { id: 'B', text: 'Lễ hội dân gian.' },
              { id: 'C', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'D', text: 'Tập quán xã hội và tín ngưỡng.' }
            ],
            correctAnswer: 'A'
          },
          {
            id: 2,
            question: 'Hình ảnh sau đây thuộc loại hình di sản văn hóa phi vật thể nào?',
            image: 'cauhoi/banh-chung-bo-dau.png',
            imageAlt: 'Sản phẩm bánh chưng Bờ Đậu (Phú Lương, tỉnh Thái Nguyên)',
            caption: 'Sản phẩm bánh chưng Bờ Đậu (Phú Lương, tỉnh Thái Nguyên) (Nguồn: UBND huyện Phú Lương, tỉnh Thái Nguyên)',
            options: [
              { id: 'A', text: 'Nghề thủ công truyền thống.' },
              { id: 'B', text: 'Lễ hội dân gian.' },
              { id: 'C', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'D', text: 'Tập quán xã hội và tín ngưỡng.' }
            ],
            correctAnswer: 'A'
          },
          {
            id: 3,
            question: 'Hình ảnh sau đây thuộc loại hình di sản văn hóa phi vật thể nào?',
            image: 'cauhoi/che-tan-cuong.png',
            imageAlt: 'Chế biến chè Tân Cương - Thái Nguyên',
            caption: 'Chế biến chè Tân Cương - Thái Nguyên (Nguồn: Sở Văn hóa, Thể Thao và Du lịch Thái Nguyên)',
            options: [
              { id: 'A', text: 'Tri thức dân gian.' },
              { id: 'B', text: 'Lễ hội dân gian.' },
              { id: 'C', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'D', text: 'Tập quán xã hội và tín ngưỡng.' }
            ],
            correctAnswer: 'A'
          },
          {
            id: 4,
            question: 'Hình ảnh sau đây thuộc loại hình di sản văn hóa phi vật thể nào?',
            image: 'cauhoi/nghi-le-het-khoan.png',
            imageAlt: 'Nghi lễ Hét khoăn - Lễ mừng sinh nhật của người Nùng',
            caption: '“Nghi lễ Hét khoăn” - Lễ mừng sinh nhật của người Nùng (Nguồn Du lịch Thái Nguyên)',
            options: [
              { id: 'A', text: 'Tri thức dân gian.' },
              { id: 'B', text: 'Lễ hội dân gian.' },
              { id: 'C', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'D', text: 'Tập quán xã hội và tín ngưỡng.' }
            ],
            correctAnswer: 'D'
          },
          {
            id: 5,
            question: 'Hình ảnh sau đây thuộc loại hình di sản văn hóa phi vật thể nào?',
            image: 'cauhoi/le-hoi-den-duom.png',
            imageAlt: 'Lễ hội Đền Đuổm',
            caption: 'Nguồn: Cục Du lịch quốc gia Việt Nam',
            options: [
              { id: 'A', text: 'Tri thức dân gian.' },
              { id: 'B', text: 'Lễ hội truyền thống.' },
              { id: 'C', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'D', text: 'Tập quán xã hội và tín ngưỡng.' }
            ],
            correctAnswer: 'B'
          },
          {
            id: 6,
            question: 'Hình ảnh sau đây thuộc loại hình di sản văn hóa phi vật thể nào?',
            image: 'cauhoi/mua-khen-mong.png',
            imageAlt: 'Người Mông ở Đồng Hỷ (Thái Nguyên) múa khèn trong ngày hội',
            caption: 'Người Mông ở Đồng Hỷ (Thái Nguyên) múa khèn trong ngày hội (Nguồn: TTXVN)',
            options: [
              { id: 'A', text: 'Tri thức dân gian.' },
              { id: 'B', text: 'Lễ hội truyền thống.' },
              { id: 'C', text: 'Nghệ thuật trình diễn dân gian.' },
              { id: 'D', text: 'Tập quán xã hội và tín ngưỡng.' }
            ],
            correctAnswer: 'C'
          },
          {
            id: 7,
            question: 'Hình ảnh sau đây thuộc di sản văn hóa phi vật thể nào của người Tày ở Thẩm Rộc và Ru Nghệ (xã Định Hóa, xã Bình Yên)',
            image: 'cauhoi/roi-can-tay.png',
            imageAlt: 'Một tiết mục biểu diễn Rối cạn của giáo viên trường THPT Bình Yên',
            caption: 'Một tiết mục biểu diễn của giáo viên trường THPT Bình Yên (ảnh thực nghiệm)',
            options: [
              { id: 'A', text: 'Tri thức dân gian.' },
              { id: 'B', text: 'Nghi lễ cầu mùa người Sán Chay.' },
              { id: 'C', text: 'Rối cạn của người Tày ở Thẩm Rộc và Ru Nghệ.' },
              { id: 'D', text: 'Lễ hội truyền thống Đền Đuổm.' }
            ],
            correctAnswer: 'C'
          },
          {
            id: 8,
            question: 'Hình ảnh sau đây thuộc di sản văn hóa phi vật thể nào của người Dao Đỏ Xã Chợ Đồn Tỉnh Thái Nguyên',
            image: 'cauhoi/trang-phuc-dao-do.png',
            imageAlt: 'Trang phục truyền thống của người Dao đỏ ở Bắc Kạn',
            caption: 'Trang phục truyền thống của người Dao đỏ ở Bắk Kạn. Ảnh: baobackan.org.vn',
            options: [
              { id: 'A', text: 'Không gian văn hóa cộng đồng.' },
              { id: 'B', text: 'Nghi lễ trong ngày cưới hỏi.' },
              { id: 'C', text: 'Nghi lễ Cấp sắc.' },
              { id: 'D', text: 'Nghệ thuật trang trí hoa văn trên trang phục.' }
            ],
            correctAnswer: 'D'
          },
          {
            id: 9,
            question: 'Hình ảnh sau đây thuộc di sản văn hóa phi vật thể nào của người Sán Chay ở Xã Phú Lương, Xã Yên Trạch, Xã Hợp Thành, xã Yên Trạch Tỉnh Thái Nguyên',
            image: 'cauhoi/mua-tac-xinh.png',
            imageAlt: 'Múa tra mố - Múa Tắc Xình của người Sán Chay',
            caption: 'Múa tra mố. Ảnh: Theo Hồ sơ di sản',
            options: [
              { id: 'A', text: 'Nghi lễ trong Lễ hội Lồng Tồng.' },
              { id: 'B', text: 'Múa Tắc Xình.' },
              { id: 'C', text: 'Nghi lễ trong Lễ hội Cầu mùa.' },
              { id: 'D', text: 'Nghi lễ Tết nhảy (Nhảng chầm đao).' }
            ],
            correctAnswer: 'B'
          },
          {
            id: 10,
            question: 'Hình ảnh sau đây thuộc di sản văn hóa phi vật thể nào (Xã Vạn Phú -Tỉnh Thái Nguyên)',
            image: 'cauhoi/le-hoi-nui-van-nui-vo.png',
            imageAlt: 'Dòng họ Lưu ở xã Văn Yên (Đại Từ) rước Lễ vào đền thờ Lưu Nhân Chú',
            caption: 'Dòng họ Lưu ở xã Văn Yên (Đại Từ) rước Lễ vào đền thờ Lưu Nhân Chú (Nguồn: THPT Lưu Nhân Chú)',
            options: [
              { id: 'A', text: 'Nghi lễ trong Lễ hội Lồng Tồng.' },
              { id: 'B', text: 'Lễ hội Núi Văn-Núi Võ.' },
              { id: 'C', text: 'Nghi lễ trong Lễ hội Cầu mùa.' },
              { id: 'D', text: 'Nghi lễ Tết nhảy (Nhảng chầm đao).' }
            ],
            correctAnswer: 'B'
          }
        ]
      },

      hint: {
        id: 'hint',
        badge: 'THẺ 3 – THÁM TỬ DI SẢN',
        title: 'GIẢI MÃ GỢI Ý',
        icon: 'fa-solid fa-magnifying-glass',
        description: 'Vận dụng khả năng suy luận, phân tích từng gợi ý để tìm ra tên di sản hoặc lễ hội bí ẩn.',
        questionCountLabel: '5 câu hỏi',
        formatLabel: 'Đọc gợi ý và chọn đáp án',
        difficultyLabel: 'Suy luận',
        questions: [
          {
            id: 1,
            question: 'Đây là lễ hội nào?',
            hints: [
              'Có 3 kỳ lễ (lễ Khai đài cầu phúc diễn ra vào ngày 14 và 15 tháng Giêng; Tiểu lệ - Lễ Cầu mác diễn ra vào ngày 10/4 âm lịch và Đại lệ - lệ làng diễn ra vào ngày 9 đến 11/10 âm lịch.',
              'Lễ hội gắn liền với tín ngưỡng thờ Dương Tự Minh',
              'Diễn ra trên địa bàn Xã Phú Bình'
            ],
            options: [
              { id: 'A', text: 'Lễ hội Đền Đuổm' },
              { id: 'B', text: 'Lễ hội Đình Phương Độ' },
              { id: 'C', text: 'Lễ hội Núi Văn - Núi Võ' },
              { id: 'D', text: 'Lễ hội Lồng Tồng' }
            ],
            correctAnswer: 'B',
            answer: 'Lễ hội Đình Phương Độ'
          },
          {
            id: 2,
            question: 'Đây là nghi lễ nào của người Nùng ở Xã Xuân Dương tỉnh Thái Nguyên?',
            hints: [
              'Có nghi thức Bắc cầu để kéo dài tuổi thọ',
              'Người được tổ chức từ 70 tuổi trở lên',
              'Được tổ chức vào đúng ngày sinh nhật hoặc nhưng nếu sinh nhật trùng vào dịp đầu xuân năm mới.'
            ],
            options: [
              { id: 'A', text: 'Lễ Nghi lễ mừng sinh nhật (Hoắt khoăn)' },
              { id: 'B', text: 'Nghi lễ Cấp sắc' },
              { id: 'C', text: 'Nghi lễ Tết nhảy (Nhảng chầm đao)' },
              { id: 'D', text: 'Lễ hội Cầu mùa' }
            ],
            correctAnswer: 'A',
            answer: 'Lễ Nghi lễ mừng sinh nhật (Hoắt khoăn)'
          },
          {
            id: 3,
            question: 'Đây là lễ hội nào?',
            hints: [
              'Cầu cho một năm mới mưa thuận, gió hòa, mùa màng bội thu, nhà nhà no ấm, hạnh phúc.',
              'Lễ hội truyền thống đặc sắc của của người Tày',
              'Lễ hội có tên gọi khác là “ Xuống đồng”'
            ],
            options: [
              { id: 'A', text: 'Lễ hội Đền Lục Giáp' },
              { id: 'B', text: 'Lễ hội Đình Phương Độ' },
              { id: 'C', text: 'Lễ hội Lồng Tồng' },
              { id: 'D', text: 'Lễ hội Đền Đuổm' }
            ],
            correctAnswer: 'C',
            answer: 'Lễ hội Lồng Tồng'
          },
          {
            id: 4,
            question: 'Đây là loại hình nghệ thuật trình diễn dân gian nào?',
            hints: [
              'Là một trong những loại hình nghệ thuật trình diễn dân gian tiêu biểu của người Tày',
              'Do người phụ nữ đảm nhiệm, biểu diễn theo nhóm từ 4 đến 12 người.',
              'Nhạc cụ chính của điệu múa là chiếc bát và đôi đũa'
            ],
            options: [
              { id: 'A', text: 'Múa Tắc Xình của người Sán Chay' },
              { id: 'B', text: 'Rối cạn của người Tày ở Thẩm Rộc và Ru Nghệ' },
              { id: 'C', text: 'Nghệ thuật Khèn của người Mông' },
              { id: 'D', text: 'Múa bát của người Tày ở Bắc Kạn (tỉnh Thái Nguyên)' }
            ],
            correctAnswer: 'D',
            answer: 'Múa bát của người Tày ở Bắc Kạn (tỉnh Thái Nguyên)'
          },
          {
            id: 5,
            question: 'Đây là loại hình nghệ thuật trình diễn dân gian nào?',
            hints: [
              'Không sử dụng bất kỳ nhạc cụ đệm nào, chỉ đơn thuần là giọng hát đối đáp giữa các cặp nam nữ.',
              'Là một trong những loại hình nghệ thuật trình diễn dân gian tiêu biểu của người Sán Chay ở Phú Lương (Thái Nguyên)',
              'Còn có tên gọi khác là Hát ví Lưu Tam'
            ],
            options: [
              { id: 'A', text: 'Hát Sọong cô' },
              { id: 'B', text: 'Hát Sấng Cọ' },
              { id: 'C', text: 'Lượn Cọi' },
              { id: 'D', text: 'Pả Dung' }
            ],
            correctAnswer: 'B',
            answer: 'Hát Sấng Cọ'
          }
        ]
      }
    },

    congratulations: [
      'Xuất sắc! Bạn đã chinh phục thành công câu hỏi này!',
      'Tuyệt vời! Kiến thức về di sản Thái Nguyên của bạn thật đáng nể!',
      'Chúc mừng! Bạn đã giải mã thành công một giá trị văn hóa quê hương!',
      'Quá tuyệt vời! Hãy tiếp tục hành trình khám phá di sản!',
      'Một câu trả lời chính xác! Bạn đang tiến gần hơn đến danh hiệu Nhà khám phá di sản!'
    ],

    ranks: [
      {
        minPercent: 90,
        title: 'BẬC THẦY DI SẢN',
        icon: 'fa-solid fa-crown',
        badgeClass: 'quiz-rank-master',
        description: 'Kiến thức xuất sắc! Bạn thực sự là một chuyên gia am hiểu sâu sắc kho tàng di sản văn hóa phi vật thể tỉnh Thái Nguyên.'
      },
      {
        minPercent: 70,
        title: 'NHÀ KHÁM PHÁ DI SẢN',
        icon: 'fa-solid fa-compass',
        badgeClass: 'quiz-rank-explorer',
        description: 'Rất ấn tượng! Bạn nắm vững nhiều giá trị văn hóa đặc sắc của đồng bào các dân tộc Thái Nguyên.'
      },
      {
        minPercent: 50,
        title: 'NGƯỜI YÊU DI SẢN',
        icon: 'fa-solid fa-heart',
        badgeClass: 'quiz-rank-lover',
        description: 'Khởi đầu đáng khích lệ! Hãy tiếp tục khám phá thêm để chinh phục trọn vẹn kho tàng di sản quê hương.'
      },
      {
        minPercent: 0,
        title: 'HỌC GIẢ TẬP SỰ',
        icon: 'fa-solid fa-seedling',
        badgeClass: 'quiz-rank-apprentice',
        description: 'Mỗi câu hỏi là một hành trình mới! Hãy thử sức lại để ghi nhớ thêm nhiều di sản văn hóa quý báu của Thái Nguyên.'
      }
    ]
  };

  window.HERITAGE_QUIZ_DATA = HERITAGE_QUIZ_DATA;
})(window);

