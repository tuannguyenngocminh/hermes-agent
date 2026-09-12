import banDongHanh from './personas/SOUL-ban-dong-hanh.md?raw'
import chuyenNghiep from './personas/SOUL-chuyen-nghiep.md?raw'
import giaCatLuong from './personas/SOUL-gia-cat-luong.md?raw'
import jarvis from './personas/SOUL-jarvis.md?raw'
import quanGia from './personas/SOUL-quan-gia.md?raw'
import tungTung from './personas/SOUL-tung-tung.md?raw'

export interface SoulTemplate {
  id: string
  label: string
  content: string
}

export const SOUL_TEMPLATES = [
  { id: 'jarvis', label: 'Jarvis', content: jarvis },
  { id: 'chuyen-nghiep', label: 'Chuyên nghiệp', content: chuyenNghiep },
  { id: 'quan-gia', label: 'Quản gia', content: quanGia },
  { id: 'ban-dong-hanh', label: 'Bạn đồng hành', content: banDongHanh },
  { id: 'gia-cat-luong', label: 'Gia Cát Lượng', content: giaCatLuong },
  { id: 'tung-tung', label: 'Tưng Tửng', content: tungTung }
] satisfies readonly SoulTemplate[]
